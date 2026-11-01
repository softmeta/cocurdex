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
	out := binary.LittleEndian.AppendUint64(nil, uint64(len(pieces))&^(1<<63))
	for _, piece := range pieces {
		out = binary.LittleEndian.AppendUint64(out, uint64(len(piece))&^(1<<63))
		out = append(out, piece...)
	}
	return out
}

func SignPasetoV4Public(key ed25519.PrivateKey, message, implicit []byte) string {
	signed := pasetoPAE([]byte(pasetoPublicHeader), message, nil, implicit)
	signature := ed25519.Sign(key, signed)
	body := append(append([]byte(nil), message...), signature...)
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
