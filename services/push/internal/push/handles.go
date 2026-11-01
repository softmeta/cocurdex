package push

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/chacha20poly1305"
)

const (
	handlePrefix         = "v1."
	handleAssociatedData = "cocurdex-push-handle/1"
	HandleKeyLength      = chacha20poly1305.KeySize
)

var (
	ErrHandleInvalid = errors.New("the push handle is not valid")
	ErrHandleRetired = errors.New("the push handle was sealed with a retired key")
)

type HandleClaims struct {
	Platform    string `json:"p"`
	Token       string `json:"t"`
	Environment string `json:"e"`
	HostKey     string `json:"k"`
	CreatedAt   int64  `json:"c"`
}

type HandleSealer struct {
	current byte
	keys    map[byte][]byte
}

func NewHandleSealer(current byte, keys map[byte][]byte) (*HandleSealer, error) {
	if _, ok := keys[current]; !ok {
		return nil, fmt.Errorf("handle key %d is missing", current)
	}
	copied := make(map[byte][]byte, len(keys))
	for id, key := range keys {
		if len(key) != HandleKeyLength {
			return nil, fmt.Errorf("handle key %d must have %d bytes", id, HandleKeyLength)
		}
		copied[id] = append([]byte(nil), key...)
	}
	return &HandleSealer{current: current, keys: copied}, nil
}

func (s *HandleSealer) Seal(claims HandleClaims) (string, error) {
	plaintext, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	aead, err := chacha20poly1305.NewX(s.keys[s.current])
	if err != nil {
		return "", err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := append([]byte{s.current}, nonce...)
	sealed = aead.Seal(sealed, nonce, plaintext, []byte(handleAssociatedData))
	return handlePrefix + EncodeBase64URL(sealed), nil
}

func (s *HandleSealer) Open(handle string) (HandleClaims, error) {
	encoded, ok := strings.CutPrefix(handle, handlePrefix)
	if !ok {
		return HandleClaims{}, ErrHandleInvalid
	}
	sealed, err := DecodeBase64URL(encoded, 0)
	if err != nil || len(sealed) < 1+chacha20poly1305.NonceSizeX+chacha20poly1305.Overhead {
		return HandleClaims{}, ErrHandleInvalid
	}
	key, ok := s.keys[sealed[0]]
	if !ok {
		return HandleClaims{}, ErrHandleRetired
	}
	aead, err := chacha20poly1305.NewX(key)
	if err != nil {
		return HandleClaims{}, err
	}
	nonceEnd := 1 + aead.NonceSize()
	plaintext, err := aead.Open(nil, sealed[1:nonceEnd], sealed[nonceEnd:], []byte(handleAssociatedData))
	if err != nil {
		return HandleClaims{}, ErrHandleInvalid
	}
	var claims HandleClaims
	if err := json.Unmarshal(plaintext, &claims); err != nil {
		return HandleClaims{}, ErrHandleInvalid
	}
	return claims, nil
}

func (c HandleClaims) BoundTo(hostKey ed25519.PublicKey) bool {
	return c.HostKey == EncodeBase64URL(hostKey)
}
