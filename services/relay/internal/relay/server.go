package relay

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

type Config struct {
	Bindings            *Bindings
	Revocations         *Revocations
	CredentialIssuer    ed25519.PublicKey
	MaxSessionsPerRoute int
	RegisterTimeout     time.Duration
	HostAcceptTimeout   time.Duration
	SessionIdleTimeout  time.Duration
	PingInterval        time.Duration
	HostLimiter         *RateLimiter
	ConnectLimiter      *RateLimiter
	TrustProxy          bool
	WebAssets           http.Handler
	Logger              *slog.Logger
	Now                 func() time.Time
}

func DefaultConfig() Config {
	return Config{
		MaxSessionsPerRoute: 32,
		RegisterTimeout:     10 * time.Second,
		HostAcceptTimeout:   10 * time.Second,
		SessionIdleTimeout:  10 * time.Minute,
		PingInterval:        30 * time.Second,
		HostLimiter:         NewRateLimiter(1, 10, nil),
		ConnectLimiter:      NewRateLimiter(5, 30, nil),
	}
}

type hostEntry struct {
	conn      *websocket.Conn
	cancel    context.CancelFunc
	account   string
	expiresAt time.Time
	writeMu   sync.Mutex
	revoked   chan struct{}
	revoke    sync.Once
}

func (e *hostEntry) end(code websocket.StatusCode, reason string) {
	e.revoke.Do(func() { close(e.revoked) })
	e.conn.Close(code, reason)
	e.cancel()
}

func (e *hostEntry) write(ctx context.Context, message any) error {
	e.writeMu.Lock()
	defer e.writeMu.Unlock()
	return wsjson.Write(ctx, e.conn, message)
}

type Server struct {
	config   Config
	mu       sync.Mutex
	hosts    map[string]*hostEntry
	sessions map[string]int
	tickets  map[string]chan *websocket.Conn
	mux      *http.ServeMux
}

func NewServer(config Config) *Server {
	if config.Bindings == nil {
		config.Bindings, _ = OpenBindings("")
	}
	if config.Revocations == nil {
		config.Revocations, _ = OpenRevocations("")
	}
	if config.Logger == nil {
		config.Logger = slog.Default()
	}
	if config.Now == nil {
		config.Now = time.Now
	}
	server := &Server{
		config:   config,
		hosts:    map[string]*hostEntry{},
		sessions: map[string]int{},
		tickets:  map[string]chan *websocket.Conn{},
		mux:      http.NewServeMux(),
	}
	server.mux.HandleFunc("GET /healthz", server.handleHealth)
	server.mux.HandleFunc("GET /v1/host", server.handleHost)
	server.mux.HandleFunc("GET /v1/host/accept/{ticket}", server.handleAccept)
	server.mux.HandleFunc("GET /v1/connect/{routeId}", server.handleConnect)
	if config.WebAssets != nil {
		server.mux.Handle("GET /", config.WebAssets)
	}
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

func accept(w http.ResponseWriter, r *http.Request, readLimit int64, subprotocols ...string) (*websocket.Conn, error) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
		Subprotocols: subprotocols,
	})
	if err != nil {
		return nil, err
	}
	conn.SetReadLimit(readLimit)
	return conn, nil
}

func randomToken(length int) string {
	value := make([]byte, length)
	_, _ = rand.Read(value)
	return EncodeBase64URL(value)
}

func registrationCloseCode(err error) websocket.StatusCode {
	switch {
	case errors.Is(err, ErrRouteTaken):
		return CloseRouteTaken
	case errors.Is(err, ErrCredentialMissing),
		errors.Is(err, ErrCredentialInvalid),
		errors.Is(err, ErrCredentialExpired),
		errors.Is(err, ErrCredentialRevoked):
		return CloseCredentialNeeded
	case errors.Is(err, errProtocol):
		return CloseProtocolError
	default:
		return CloseUnauthorized
	}
}

func (s *Server) handleHost(w http.ResponseWriter, r *http.Request) {
	conn, err := accept(w, r, maxControlFrameSize)
	if err != nil {
		return
	}
	if !s.config.HostLimiter.Allow(s.clientIP(r)) {
		conn.Close(CloseRateLimited, "rate limited")
		return
	}
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	verified, err := s.register(ctx, conn)
	if err != nil {
		s.config.Logger.Info("host registration refused", "error", err)
		conn.Close(registrationCloseCode(err), err.Error())
		return
	}
	routeID := verified.RouteID
	entry := &hostEntry{
		conn:      conn,
		cancel:    cancel,
		account:   verified.AccountID,
		expiresAt: verified.ExpiresAt,
		revoked:   make(chan struct{}),
	}
	entry.writeMu.Lock()
	s.install(routeID, entry)
	defer s.uninstall(routeID, entry)
	confirmCtx, cancelConfirm := context.WithTimeout(ctx, s.config.RegisterTimeout)
	registered := RegisteredMessage{Type: "registered", RouteID: routeID}
	err = wsjson.Write(confirmCtx, conn, registered)
	cancelConfirm()
	entry.writeMu.Unlock()
	if err != nil {
		return
	}
	s.config.Logger.Info("host registered", "route", routeID[:6])
	go s.keepAlive(ctx, conn, cancel)
	for {
		if _, _, err := conn.Read(ctx); err != nil {
			conn.Close(websocket.StatusNormalClosure, "")
			return
		}
	}
}

func (s *Server) register(ctx context.Context, conn *websocket.Conn) (VerifiedRegistration, error) {
	registerCtx, cancel := context.WithTimeout(ctx, s.config.RegisterTimeout)
	defer cancel()
	nonce := make([]byte, NonceLength)
	_, _ = rand.Read(nonce)
	challenge := ChallengeMessage{Type: "challenge", Nonce: EncodeBase64URL(nonce)}
	if err := wsjson.Write(registerCtx, conn, challenge); err != nil {
		return VerifiedRegistration{}, err
	}
	var message RegisterMessage
	if err := wsjson.Read(registerCtx, conn, &message); err != nil {
		return VerifiedRegistration{}, errors.Join(errProtocol, err)
	}
	if message.Type != "register" {
		return VerifiedRegistration{}, errProtocol
	}
	verified, err := VerifyRegistration(
		message,
		nonce,
		s.config.CredentialIssuer,
		s.config.Now(),
	)
	if err != nil {
		return VerifiedRegistration{}, err
	}
	if verified.AccountID != "" && s.revoked(verified.AccountID) {
		return VerifiedRegistration{}, ErrCredentialRevoked
	}
	if err := s.config.Bindings.Claim(verified.RouteID, verified.SigningKey); err != nil {
		return VerifiedRegistration{}, err
	}
	return verified, nil
}

func (s *Server) revoked(account string) bool {
	if _, err := s.config.Revocations.Refresh(); err != nil {
		s.config.Logger.Error("reading revocations failed", "error", err)
	}
	return s.config.Revocations.Revoked(account)
}

func (s *Server) EnforceCredentials(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.SweepCredentials()
		}
	}
}

func (s *Server) SweepCredentials() {
	if _, err := s.config.Revocations.Refresh(); err != nil {
		s.config.Logger.Error("reading revocations failed", "error", err)
	}
	now := s.config.Now()
	s.mu.Lock()
	var ended []*hostEntry
	var reasons []error
	for _, entry := range s.hosts {
		if entry.account == "" {
			continue
		}
		switch {
		case s.config.Revocations.Revoked(entry.account):
			ended, reasons = append(ended, entry), append(reasons, ErrCredentialRevoked)
		case !now.Before(entry.expiresAt):
			ended, reasons = append(ended, entry), append(reasons, ErrCredentialExpired)
		}
	}
	s.mu.Unlock()
	for index, entry := range ended {
		s.config.Logger.Info("host disconnected", "account", entry.account, "reason", reasons[index])
		entry.end(CloseCredentialNeeded, reasons[index].Error())
	}
}

func (s *Server) install(routeID string, entry *hostEntry) {
	s.mu.Lock()
	previous := s.hosts[routeID]
	s.hosts[routeID] = entry
	s.mu.Unlock()
	if previous != nil {
		previous.conn.Close(CloseReplaced, "replaced by a newer connection")
		previous.cancel()
	}
}

func (s *Server) uninstall(routeID string, entry *hostEntry) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.hosts[routeID] == entry {
		delete(s.hosts, routeID)
	}
}

func (s *Server) keepAlive(ctx context.Context, conn *websocket.Conn, cancel context.CancelFunc) {
	ticker := time.NewTicker(s.config.PingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			pingCtx, done := context.WithTimeout(ctx, s.config.PingInterval)
			err := conn.Ping(pingCtx)
			done()
			if err != nil {
				cancel()
				return
			}
		}
	}
}

func (s *Server) handleAccept(w http.ResponseWriter, r *http.Request) {
	ticket := r.PathValue("ticket")
	s.mu.Lock()
	waiting, ok := s.tickets[ticket]
	delete(s.tickets, ticket)
	s.mu.Unlock()
	if !ok {
		http.Error(w, "unknown ticket", http.StatusNotFound)
		return
	}
	conn, err := accept(w, r, MaxMessageBytes, ChannelSubprotocol)
	if err != nil {
		return
	}
	waiting <- conn
}

type session struct {
	routeID string
	entry   *hostEntry
	ticket  string
	waiting chan *websocket.Conn
}

func (s *Server) openSession(routeID string) (*session, websocket.StatusCode) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entry := s.hosts[routeID]
	if entry == nil {
		return nil, CloseHostOffline
	}
	if s.sessions[routeID] >= s.config.MaxSessionsPerRoute {
		return nil, CloseTooManySessions
	}
	s.sessions[routeID]++
	opened := &session{
		routeID: routeID,
		entry:   entry,
		ticket:  randomToken(TicketLength),
		waiting: make(chan *websocket.Conn, 1),
	}
	s.tickets[opened.ticket] = opened.waiting
	return opened, 0
}

func (s *Server) closeSession(opened *session) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.tickets, opened.ticket)
	if s.sessions[opened.routeID] <= 1 {
		delete(s.sessions, opened.routeID)
		return
	}
	s.sessions[opened.routeID]--
}

func (s *Server) handleConnect(w http.ResponseWriter, r *http.Request) {
	routeID := r.PathValue("routeId")
	device, err := accept(w, r, MaxMessageBytes, ChannelSubprotocol)
	if err != nil {
		return
	}
	if !s.config.ConnectLimiter.Allow(s.clientIP(r)) {
		device.Close(CloseRateLimited, "rate limited")
		return
	}
	if _, err := DecodeBase64URL(routeID, RouteIDLength); err != nil {
		device.Close(CloseProtocolError, "malformed route id")
		return
	}
	opened, refusal := s.openSession(routeID)
	if opened == nil {
		device.Close(refusal, "")
		return
	}
	defer s.closeSession(opened)
	notifyCtx, cancelNotify := context.WithTimeout(r.Context(), s.config.HostAcceptTimeout)
	incoming := IncomingMessage{Type: "incoming", Ticket: opened.ticket}
	err = opened.entry.write(notifyCtx, incoming)
	cancelNotify()
	if err != nil {
		device.Close(CloseHostOffline, "")
		return
	}
	timer := time.NewTimer(s.config.HostAcceptTimeout)
	defer timer.Stop()
	select {
	case host := <-opened.waiting:
		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()
		go func() {
			select {
			case <-opened.entry.revoked:
				cancel()
			case <-ctx.Done():
			}
		}()
		s.forward(ctx, device, host)
	case <-timer.C:
		device.Close(CloseHostTimeout, "the computer did not answer")
	case <-r.Context().Done():
		device.Close(websocket.StatusGoingAway, "")
	}
}

func (s *Server) forward(parent context.Context, device, host *websocket.Conn) {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	idle := time.AfterFunc(s.config.SessionIdleTimeout, cancel)
	defer idle.Stop()
	touch := func() { idle.Reset(s.config.SessionIdleTimeout) }

	var once sync.Once
	finish := func(from, to *websocket.Conn, err error) {
		once.Do(func() {
			code, reason := closeStatusFor(err)
			go to.Close(code, reason)
			go from.Close(code, reason)
		})
	}
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		finish(device, host, pipe(ctx, device, host, touch))
	}()
	go func() {
		defer wg.Done()
		finish(host, device, pipe(ctx, host, device, touch))
	}()
	wg.Wait()
}

func closeStatusFor(err error) (websocket.StatusCode, string) {
	if code := websocket.CloseStatus(err); code != -1 {
		return code, ""
	}
	if errors.Is(err, errProtocol) {
		return CloseProtocolError, "binary messages only"
	}
	return websocket.StatusGoingAway, ""
}

func pipe(ctx context.Context, from, to *websocket.Conn, touch func()) error {
	for {
		kind, data, err := from.Read(ctx)
		if err != nil {
			return err
		}
		if kind != websocket.MessageBinary {
			return errProtocol
		}
		touch()
		if err := to.Write(ctx, websocket.MessageBinary, data); err != nil {
			return err
		}
	}
}

func (s *Server) RouteOnline(routeID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.hosts[routeID] != nil
}
