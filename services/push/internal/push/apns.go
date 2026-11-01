package push

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"sync"
	"time"
)

const (
	APNsProductionEndpoint = "https://api.push.apple.com"
	APNsSandboxEndpoint    = "https://api.sandbox.push.apple.com"
	apnsTokenLifetime      = 50 * time.Minute
	FallbackLocKey         = "PUSH_FALLBACK"
)

type APNsConfig struct {
	KeyID      string
	TeamID     string
	Topic      string
	PrivateKey *ecdsa.PrivateKey
	Endpoints  map[string]string
	Client     *http.Client
	Now        func() time.Time
}

type APNsSender struct {
	config      APNsConfig
	mu          sync.Mutex
	bearer      string
	bearerIssue time.Time
}

func ParseAPNsKey(pemBytes []byte) (*ecdsa.PrivateKey, error) {
	block, _ := pem.Decode(pemBytes)
	if block == nil {
		return nil, errors.New("the APNs key is not PEM encoded")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse APNs key: %w", err)
	}
	key, ok := parsed.(*ecdsa.PrivateKey)
	if !ok {
		return nil, errors.New("the APNs key is not an ECDSA key")
	}
	return key, nil
}

func NewAPNsSender(config APNsConfig) (*APNsSender, error) {
	if config.KeyID == "" || config.TeamID == "" || config.Topic == "" || config.PrivateKey == nil {
		return nil, errors.New("APNs needs a key id, team id, topic, and private key")
	}
	if config.Endpoints == nil {
		config.Endpoints = map[string]string{
			EnvironmentProduction: APNsProductionEndpoint,
			EnvironmentSandbox:    APNsSandboxEndpoint,
		}
	}
	if config.Client == nil {
		config.Client = &http.Client{Timeout: 15 * time.Second}
	}
	if config.Now == nil {
		config.Now = time.Now
	}
	return &APNsSender{config: config}, nil
}

func (s *APNsSender) providerToken() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.config.Now()
	if s.bearer != "" && now.Sub(s.bearerIssue) < apnsTokenLifetime {
		return s.bearer, nil
	}
	header := EncodeBase64URL(mustJSON(map[string]string{"alg": "ES256", "kid": s.config.KeyID}))
	claims := EncodeBase64URL(mustJSON(map[string]any{"iss": s.config.TeamID, "iat": now.Unix()}))
	signingInput := header + "." + claims
	digest := sha256.Sum256([]byte(signingInput))
	r, sigS, err := ecdsa.Sign(rand.Reader, s.config.PrivateKey, digest[:])
	if err != nil {
		return "", err
	}
	signature := make([]byte, 64)
	r.FillBytes(signature[:32])
	sigS.FillBytes(signature[32:])
	s.bearer = signingInput + "." + EncodeBase64URL(signature)
	s.bearerIssue = now
	return s.bearer, nil
}

type apnsAlert struct {
	LocKey string `json:"loc-key"`
}

type apnsAps struct {
	Alert          apnsAlert `json:"alert"`
	MutableContent int       `json:"mutable-content"`
	Sound          string    `json:"sound"`
	ThreadID       string    `json:"thread-id,omitempty"`
}

type apnsPayload struct {
	Aps        apnsAps `json:"aps"`
	Ciphertext string  `json:"c"`
}

func (s *APNsSender) Send(ctx context.Context, notification Notification) error {
	endpoint, ok := s.config.Endpoints[notification.Environment]
	if !ok {
		return fmt.Errorf("%w: unknown APNs environment", ErrUpstream)
	}
	body := mustJSON(apnsPayload{
		Aps: apnsAps{
			Alert:          apnsAlert{LocKey: FallbackLocKey},
			MutableContent: 1,
			Sound:          "default",
			ThreadID:       notification.ThreadID,
		},
		Ciphertext: notification.Ciphertext,
	})
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		endpoint+"/3/device/"+notification.Token,
		bytes.NewReader(body),
	)
	if err != nil {
		return err
	}
	bearer, err := s.providerToken()
	if err != nil {
		return err
	}
	request.Header.Set("authorization", "bearer "+bearer)
	request.Header.Set("apns-topic", s.config.Topic)
	request.Header.Set("apns-push-type", "alert")
	request.Header.Set("content-type", "application/json")
	if notification.Priority == PriorityNormal {
		request.Header.Set("apns-priority", "5")
	} else {
		request.Header.Set("apns-priority", "10")
	}
	if notification.CollapseID != "" {
		request.Header.Set("apns-collapse-id", notification.CollapseID)
	}
	if notification.ExpiresAt > 0 {
		request.Header.Set("apns-expiration", strconv.FormatInt(notification.ExpiresAt, 10))
	}
	response, err := s.config.Client.Do(request)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrUpstream, err)
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusOK {
		_, _ = io.Copy(io.Discard, response.Body)
		return nil
	}
	var failure struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&failure)
	return apnsError(response.StatusCode, failure.Reason)
}

func apnsError(status int, reason string) error {
	switch {
	case status == http.StatusGone:
		return ErrUnregistered
	case reason == "BadDeviceToken" || reason == "DeviceTokenNotForTopic" || reason == "Unregistered":
		return ErrUnregistered
	default:
		return fmt.Errorf("%w: APNs %d %s", ErrUpstream, status, reason)
	}
}

func mustJSON(value any) []byte {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return encoded
}
