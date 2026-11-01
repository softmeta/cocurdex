package push

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	FCMEndpoint      = "https://fcm.googleapis.com"
	fcmScope         = "https://www.googleapis.com/auth/firebase.messaging"
	fcmTokenLifetime = time.Hour
	fcmTokenMargin   = 5 * time.Minute
)

type ServiceAccount struct {
	ProjectID   string `json:"project_id"`
	ClientEmail string `json:"client_email"`
	PrivateKey  string `json:"private_key"`
	TokenURI    string `json:"token_uri"`
}

type FCMConfig struct {
	Account  ServiceAccount
	Endpoint string
	Client   *http.Client
	Now      func() time.Time
}

type FCMSender struct {
	config      FCMConfig
	key         *rsa.PrivateKey
	mu          sync.Mutex
	accessToken string
	expiresAt   time.Time
}

func NewFCMSender(config FCMConfig) (*FCMSender, error) {
	account := config.Account
	if account.ProjectID == "" || account.ClientEmail == "" || account.TokenURI == "" {
		return nil, errors.New("the FCM service account needs project_id, client_email, and token_uri")
	}
	block, _ := pem.Decode([]byte(account.PrivateKey))
	if block == nil {
		return nil, errors.New("the FCM service account private key is not PEM encoded")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse FCM private key: %w", err)
	}
	key, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("the FCM private key is not an RSA key")
	}
	if config.Endpoint == "" {
		config.Endpoint = FCMEndpoint
	}
	if config.Client == nil {
		config.Client = &http.Client{Timeout: 15 * time.Second}
	}
	if config.Now == nil {
		config.Now = time.Now
	}
	return &FCMSender{config: config, key: key}, nil
}

func (s *FCMSender) assertion(now time.Time) (string, error) {
	header := EncodeBase64URL(mustJSON(map[string]string{"alg": "RS256", "typ": "JWT"}))
	claims := EncodeBase64URL(mustJSON(map[string]any{
		"iss":   s.config.Account.ClientEmail,
		"scope": fcmScope,
		"aud":   s.config.Account.TokenURI,
		"iat":   now.Unix(),
		"exp":   now.Add(fcmTokenLifetime).Unix(),
	}))
	signingInput := header + "." + claims
	digest := sha256.Sum256([]byte(signingInput))
	signature, err := rsa.SignPKCS1v15(rand.Reader, s.key, crypto.SHA256, digest[:])
	if err != nil {
		return "", err
	}
	return signingInput + "." + EncodeBase64URL(signature), nil
}

func (s *FCMSender) token(ctx context.Context) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.config.Now()
	if s.accessToken != "" && now.Before(s.expiresAt.Add(-fcmTokenMargin)) {
		return s.accessToken, nil
	}
	assertion, err := s.assertion(now)
	if err != nil {
		return "", err
	}
	form := url.Values{
		"grant_type": {"urn:ietf:params:oauth:grant-type:jwt-bearer"},
		"assertion":  {assertion},
	}
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		s.config.Account.TokenURI,
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return "", err
	}
	request.Header.Set("content-type", "application/x-www-form-urlencoded")
	response, err := s.config.Client.Do(request)
	if err != nil {
		return "", fmt.Errorf("%w: FCM token: %v", ErrUpstream, err)
	}
	defer response.Body.Close()
	var granted struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	decodeErr := json.NewDecoder(io.LimitReader(response.Body, 16*1024)).Decode(&granted)
	if response.StatusCode != http.StatusOK || decodeErr != nil || granted.AccessToken == "" {
		return "", fmt.Errorf("%w: FCM token %d", ErrUpstream, response.StatusCode)
	}
	s.accessToken = granted.AccessToken
	s.expiresAt = now.Add(time.Duration(granted.ExpiresIn) * time.Second)
	return s.accessToken, nil
}

type fcmAndroid struct {
	Priority    string `json:"priority"`
	CollapseKey string `json:"collapse_key,omitempty"`
	TTL         string `json:"ttl,omitempty"`
}

type fcmMessage struct {
	Token   string            `json:"token"`
	Data    map[string]string `json:"data"`
	Android fcmAndroid        `json:"android"`
}

func (s *FCMSender) Send(ctx context.Context, notification Notification) error {
	accessToken, err := s.token(ctx)
	if err != nil {
		return err
	}
	android := fcmAndroid{Priority: "HIGH", CollapseKey: notification.CollapseID}
	if notification.Priority == PriorityNormal {
		android.Priority = "NORMAL"
	}
	if notification.ExpiresAt > 0 {
		remaining := notification.ExpiresAt - s.config.Now().Unix()
		android.TTL = strconv.FormatInt(max(remaining, 0), 10) + "s"
	}
	body := mustJSON(map[string]fcmMessage{"message": {
		Token:   notification.Token,
		Data:    map[string]string{"c": notification.Ciphertext},
		Android: android,
	}})
	endpoint := fmt.Sprintf(
		"%s/v1/projects/%s/messages:send",
		s.config.Endpoint,
		url.PathEscape(s.config.Account.ProjectID),
	)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("authorization", "Bearer "+accessToken)
	request.Header.Set("content-type", "application/json")
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
		Error struct {
			Status  string `json:"status"`
			Details []struct {
				ErrorCode string `json:"errorCode"`
			} `json:"details"`
		} `json:"error"`
	}
	_ = json.NewDecoder(io.LimitReader(response.Body, 16*1024)).Decode(&failure)
	for _, detail := range failure.Error.Details {
		if detail.ErrorCode == "UNREGISTERED" {
			return ErrUnregistered
		}
	}
	if response.StatusCode == http.StatusNotFound {
		return ErrUnregistered
	}
	return fmt.Errorf("%w: FCM %d %s", ErrUpstream, response.StatusCode, failure.Error.Status)
}
