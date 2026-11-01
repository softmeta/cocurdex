package push

import (
	"encoding/base64"
	"errors"
	"fmt"
)

const (
	ProtocolVersion       = "cocurdex-push/1"
	PlatformAPNs          = "apns"
	PlatformFCM           = "fcm"
	EnvironmentProduction = "production"
	EnvironmentSandbox    = "sandbox"
	PriorityHigh          = "high"
	PriorityNormal        = "normal"
	MaxCiphertextBytes    = 2048
	MaxCollapseIDBytes    = 64
	maxRequestBytes       = 16 * 1024
)

type HandleRequest struct {
	Platform    string `json:"platform"`
	Token       string `json:"token"`
	Environment string `json:"environment"`
}

type HandleResponse struct {
	Handle string `json:"handle"`
}

type PushRequest struct {
	Handle     string `json:"handle"`
	Ciphertext string `json:"ciphertext"`
	CollapseID string `json:"collapseId,omitempty"`
	Priority   string `json:"priority,omitempty"`
	ExpiresAt  int64  `json:"expiresAt,omitempty"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

type Notification struct {
	Token       string
	Environment string
	Ciphertext  string
	CollapseID  string
	ThreadID    string
	Priority    string
	ExpiresAt   int64
}

var (
	ErrUnregistered = errors.New("the device token is no longer registered")
	ErrUpstream     = errors.New("the push service rejected the notification")
)

var encoding = base64.RawURLEncoding

func EncodeBase64URL(value []byte) string {
	return encoding.EncodeToString(value)
}

func DecodeBase64URL(value string, length int) ([]byte, error) {
	decoded, err := encoding.DecodeString(value)
	if err != nil {
		return nil, fmt.Errorf("malformed base64url: %w", err)
	}
	if length > 0 && len(decoded) != length {
		return nil, fmt.Errorf("expected %d bytes, got %d", length, len(decoded))
	}
	return decoded, nil
}
