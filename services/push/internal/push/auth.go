package push

import (
	"crypto/ed25519"
	"crypto/sha256"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

const (
	authScheme     = "Cocurdex-Push"
	MaxClockSkew   = 5 * time.Minute
	signatureLabel = ProtocolVersion
)

var (
	ErrAuthMissing   = errors.New("the request is not signed")
	ErrAuthMalformed = errors.New("the request signature header is malformed")
	ErrAuthExpired   = errors.New("the request timestamp is outside the allowed window")
	ErrAuthSignature = errors.New("the request signature does not verify")
)

func SignaturePayload(method, path string, timestamp int64, body []byte) []byte {
	digest := sha256.Sum256(body)
	payload := make([]byte, 0, len(signatureLabel)+len(method)+len(path)+64)
	payload = append(payload, signatureLabel...)
	payload = append(payload, 0)
	payload = append(payload, method...)
	payload = append(payload, 0)
	payload = append(payload, path...)
	payload = append(payload, 0)
	payload = strconv.AppendInt(payload, timestamp, 10)
	payload = append(payload, 0)
	return append(payload, digest[:]...)
}

func SignRequest(key ed25519.PrivateKey, method, path string, timestamp int64, body []byte) string {
	signature := ed25519.Sign(key, SignaturePayload(method, path, timestamp, body))
	public := key.Public().(ed25519.PublicKey)
	return fmt.Sprintf(
		"%s key=%s, ts=%d, sig=%s",
		authScheme,
		EncodeBase64URL(public),
		timestamp,
		EncodeBase64URL(signature),
	)
}

func parseAuthorization(header string) (map[string]string, error) {
	params, ok := strings.CutPrefix(header, authScheme+" ")
	if !ok {
		return nil, ErrAuthMissing
	}
	fields := map[string]string{}
	for part := range strings.SplitSeq(params, ",") {
		name, value, found := strings.Cut(strings.TrimSpace(part), "=")
		if !found || name == "" || value == "" {
			return nil, ErrAuthMalformed
		}
		fields[name] = value
	}
	return fields, nil
}

func VerifyRequest(
	header, method, path string,
	body []byte,
	now time.Time,
) (ed25519.PublicKey, error) {
	if header == "" {
		return nil, ErrAuthMissing
	}
	fields, err := parseAuthorization(header)
	if err != nil {
		return nil, err
	}
	key, err := DecodeBase64URL(fields["key"], ed25519.PublicKeySize)
	if err != nil {
		return nil, ErrAuthMalformed
	}
	signature, err := DecodeBase64URL(fields["sig"], ed25519.SignatureSize)
	if err != nil {
		return nil, ErrAuthMalformed
	}
	timestamp, err := strconv.ParseInt(fields["ts"], 10, 64)
	if err != nil {
		return nil, ErrAuthMalformed
	}
	skew := math.Abs(float64(now.Unix() - timestamp))
	if skew > MaxClockSkew.Seconds() {
		return nil, ErrAuthExpired
	}
	payload := SignaturePayload(method, path, timestamp, body)
	if !ed25519.Verify(key, payload, signature) {
		return nil, ErrAuthSignature
	}
	return ed25519.PublicKey(key), nil
}
