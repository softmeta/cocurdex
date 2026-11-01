package push

import (
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type Sender interface {
	Send(ctx context.Context, notification Notification) error
}

type Config struct {
	Sealer             *HandleSealer
	Senders            map[string]Sender
	Logger             *slog.Logger
	TrustProxy         bool
	Now                func() time.Time
	SendTimeout        time.Duration
	HostLimiter        *RateLimiter
	HostDailyLimiter   *RateLimiter
	DeviceLimiter      *RateLimiter
	HandleIssueLimiter *RateLimiter
}

func DefaultConfig() Config {
	return Config{
		SendTimeout:        15 * time.Second,
		HostLimiter:        NewRateLimiter(1, 30, nil),
		HostDailyLimiter:   NewRateLimiter(2000.0/86400.0, 2000, nil),
		DeviceLimiter:      NewRateLimiter(20.0/60.0, 20, nil),
		HandleIssueLimiter: NewRateLimiter(10.0/60.0, 10, nil),
	}
}

type Server struct {
	config Config
	mux    *http.ServeMux
}

var (
	apnsTokenPattern = regexp.MustCompile(`^[0-9a-fA-F]{64,200}$`)
	fcmTokenPattern  = regexp.MustCompile(`^[A-Za-z0-9:_\-]+$`)
)

func NewServer(config Config) *Server {
	if config.Logger == nil {
		config.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	if config.Now == nil {
		config.Now = time.Now
	}
	if config.Senders == nil {
		config.Senders = map[string]Sender{}
	}
	server := &Server{config: config, mux: http.NewServeMux()}
	server.mux.HandleFunc("GET /healthz", server.handleHealth)
	server.mux.HandleFunc("POST /v1/handles", server.handleIssue)
	server.mux.HandleFunc("POST /v1/push", server.handlePush)
	return server
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write([]byte("ok\n"))
}

func (s *Server) clientIP(r *http.Request) string {
	if s.config.TrustProxy {
		if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
			first, _, _ := strings.Cut(forwarded, ",")
			return strings.TrimSpace(first)
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, code string) {
	writeJSON(w, status, ErrorResponse{Error: code})
}

func writeRateLimited(w http.ResponseWriter, retryAfter string) {
	w.Header().Set("Retry-After", retryAfter)
	writeError(w, http.StatusTooManyRequests, "rateLimited")
}

func (s *Server) authenticate(w http.ResponseWriter, r *http.Request) (ed25519.PublicKey, []byte, bool) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxRequestBytes))
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "tooLarge")
		return nil, nil, false
	}
	hostKey, err := VerifyRequest(
		r.Header.Get("Authorization"),
		r.Method,
		r.URL.Path,
		body,
		s.config.Now(),
	)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return nil, nil, false
	}
	return hostKey, body, true
}

func validToken(platform, token string) bool {
	switch platform {
	case PlatformAPNs:
		return apnsTokenPattern.MatchString(token)
	case PlatformFCM:
		return len(token) <= 4096 && fcmTokenPattern.MatchString(token)
	default:
		return false
	}
}

func normalizeEnvironment(platform, environment string) (string, bool) {
	if environment == "" {
		environment = EnvironmentProduction
	}
	if platform == PlatformFCM {
		return environment, environment == EnvironmentProduction
	}
	return environment, environment == EnvironmentProduction || environment == EnvironmentSandbox
}

func (s *Server) handleIssue(w http.ResponseWriter, r *http.Request) {
	if !s.config.HandleIssueLimiter.Allow(s.clientIP(r)) {
		writeRateLimited(w, "60")
		return
	}
	hostKey, body, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var request HandleRequest
	if err := json.Unmarshal(body, &request); err != nil {
		writeError(w, http.StatusBadRequest, "invalidRequest")
		return
	}
	if _, configured := s.config.Senders[request.Platform]; !configured {
		writeError(w, http.StatusNotImplemented, "platformUnavailable")
		return
	}
	environment, validEnvironment := normalizeEnvironment(request.Platform, request.Environment)
	if !validEnvironment || !validToken(request.Platform, request.Token) {
		writeError(w, http.StatusBadRequest, "invalidToken")
		return
	}
	handle, err := s.config.Sealer.Seal(HandleClaims{
		Platform:    request.Platform,
		Token:       request.Token,
		Environment: environment,
		HostKey:     EncodeBase64URL(hostKey),
		CreatedAt:   s.config.Now().Unix(),
	})
	if err != nil {
		s.config.Logger.Error("seal handle", "error", err)
		writeError(w, http.StatusInternalServerError, "internal")
		return
	}
	writeJSON(w, http.StatusOK, HandleResponse{Handle: handle})
}

func threadID(hostKey string) string {
	digest := sha256.Sum256([]byte(hostKey))
	return EncodeBase64URL(digest[:12])
}

func validCiphertext(value string) bool {
	decoded, err := DecodeBase64URL(value, 0)
	return err == nil && len(decoded) > 48 && len(decoded) <= MaxCiphertextBytes
}

func (s *Server) handlePush(w http.ResponseWriter, r *http.Request) {
	hostKey, body, ok := s.authenticate(w, r)
	if !ok {
		return
	}
	var request PushRequest
	if err := json.Unmarshal(body, &request); err != nil {
		writeError(w, http.StatusBadRequest, "invalidRequest")
		return
	}
	claims, err := s.config.Sealer.Open(request.Handle)
	if errors.Is(err, ErrHandleRetired) {
		writeError(w, http.StatusGone, "unregistered")
		return
	}
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalidHandle")
		return
	}
	if !claims.BoundTo(hostKey) {
		writeError(w, http.StatusForbidden, "handleNotOwned")
		return
	}
	priority := request.Priority
	if priority == "" {
		priority = PriorityHigh
	}
	validRequest := validCiphertext(request.Ciphertext) &&
		len(request.CollapseID) <= MaxCollapseIDBytes &&
		(priority == PriorityHigh || priority == PriorityNormal)
	if !validRequest {
		writeError(w, http.StatusBadRequest, "invalidRequest")
		return
	}
	hostID := claims.HostKey
	if !s.config.HostLimiter.Allow(hostID) || !s.config.DeviceLimiter.Allow(request.Handle) {
		writeRateLimited(w, "60")
		return
	}
	if !s.config.HostDailyLimiter.Allow(hostID) {
		writeRateLimited(w, "3600")
		return
	}
	sender, configured := s.config.Senders[claims.Platform]
	if !configured {
		writeError(w, http.StatusNotImplemented, "platformUnavailable")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.config.SendTimeout)
	defer cancel()
	err = sender.Send(ctx, Notification{
		Token:       claims.Token,
		Environment: claims.Environment,
		Ciphertext:  request.Ciphertext,
		CollapseID:  request.CollapseID,
		ThreadID:    threadID(claims.HostKey),
		Priority:    priority,
		ExpiresAt:   request.ExpiresAt,
	})
	switch {
	case err == nil:
		w.WriteHeader(http.StatusAccepted)
	case errors.Is(err, ErrUnregistered):
		writeError(w, http.StatusGone, "unregistered")
	default:
		s.config.Logger.Warn("push failed", "platform", claims.Platform, "error", err)
		writeError(w, http.StatusBadGateway, "upstreamFailed")
	}
}
