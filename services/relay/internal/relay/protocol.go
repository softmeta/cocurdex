package relay

import (
	"encoding/base64"
	"errors"
	"fmt"

	"github.com/coder/websocket"
)

const (
	ProtocolVersion     = "cocurdex-relay/1"
	RouteIDLength       = 16
	NonceLength         = 32
	TicketLength        = 32
	MaxMessageBytes     = 65535 + 1024
	maxControlFrameSize = 8 * 1024
)

const (
	CloseHostOffline      websocket.StatusCode = 4404
	CloseHostTimeout      websocket.StatusCode = 4408
	CloseUnauthorized     websocket.StatusCode = 4401
	CloseRouteTaken       websocket.StatusCode = 4403
	CloseReplaced         websocket.StatusCode = 4409
	CloseCredentialNeeded websocket.StatusCode = 4402
	CloseRateLimited      websocket.StatusCode = 4429
	CloseTooManySessions  websocket.StatusCode = 4430
	CloseProtocolError    websocket.StatusCode = 4400
)

type ChallengeMessage struct {
	Type  string `json:"type"`
	Nonce string `json:"nonce"`
}

type RegisterMessage struct {
	Type       string      `json:"type"`
	RouteID    string      `json:"routeId"`
	HostKey    string      `json:"hostKey"`
	SigningKey string      `json:"signingKey"`
	Signature  string      `json:"signature"`
	Credential *Credential `json:"credential,omitempty"`
}

type RegisteredMessage struct {
	Type    string `json:"type"`
	RouteID string `json:"routeId"`
}

type IncomingMessage struct {
	Type   string `json:"type"`
	Ticket string `json:"ticket"`
}

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

var errProtocol = errors.New("protocol error")
