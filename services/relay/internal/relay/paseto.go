package relay

import (
	"crypto/ed25519"
	"encoding/binary"
	"errors"
	"strings"
)

const pasetoPublicHeader = "v4.public."

var errMalformedToken = errors.New("malformed v4.public token")

func pasetoPAE(pieces ...[]byte) []byte {
	size := 8
	for _, piece := range pieces {
		size += 8 + len(piece)
	}
	out := make([]byte, 0, size)
	out = binary.LittleEndian.AppendUint64(out, uint64(len(pieces))&^(1<<63))
	for _, piece := range pieces {
		out = binary.LittleEndian.AppendUint64(out, uint64(len(piece))&^(1<<63))
		out = append(out, piece...)
	}
	return out
}

func SignPasetoV4Public(key ed25519.PrivateKey, message, implicit []byte) string {
	signed := pasetoPAE([]byte(pasetoPublicHeader), message, nil, implicit)
	signature := ed25519.Sign(key, signed)
	body := make([]byte, 0, len(message)+len(signature))
	body = append(append(body, message...), signature...)
	return pasetoPublicHeader + EncodeBase64URL(body)
}

func VerifyPasetoV4Public(token string, key ed25519.PublicKey, implicit []byte) ([]byte, error) {
	encoded, found := strings.CutPrefix(token, pasetoPublicHeader)
	if !found || strings.Contains(encoded, ".") {
		return nil, errMalformedToken
	}
	body, err := DecodeBase64URL(encoded, 0)
	if err != nil || len(body) < ed25519.SignatureSize {
		return nil, errMalformedToken
	}
	split := len(body) - ed25519.SignatureSize
	message, signature := body[:split], body[split:]
	signed := pasetoPAE([]byte(pasetoPublicHeader), message, nil, implicit)
	if !ed25519.Verify(key, signed, signature) {
		return nil, ErrBadSignature
	}
	return message, nil
}
