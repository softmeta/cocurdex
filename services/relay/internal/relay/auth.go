package relay

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"time"
)

const credentialLabel = "cocurdex-relay-credential/2"

var (
	ErrRouteMismatch     = errors.New("route id does not match the host key")
	ErrBadSignature      = errors.New("registration signature does not verify")
	ErrCredentialMissing = errors.New("a relay credential is required")
	ErrCredentialInvalid = errors.New("the relay credential is not valid")
	ErrCredentialExpired = errors.New("the relay credential has expired")
)

func RouteIDForHostKey(hostKey []byte) []byte {
	digest := sha256.Sum256(hostKey)
	return digest[:RouteIDLength]
}

func RegistrationPayload(nonce, routeID []byte) []byte {
	payload := make([]byte, 0, len(ProtocolVersion)+len(nonce)+len(routeID))
	payload = append(payload, ProtocolVersion...)
	payload = append(payload, nonce...)
	return append(payload, routeID...)
}

type VerifiedRegistration struct {
	RouteID    string
	SigningKey ed25519.PublicKey
	AccountID  string
	ExpiresAt  time.Time
}

func VerifyRegistration(
	message RegisterMessage,
	nonce []byte,
	issuer ed25519.PublicKey,
	now time.Time,
) (VerifiedRegistration, error) {
	routeID, err := DecodeBase64URL(message.RouteID, RouteIDLength)
	if err != nil {
		return VerifiedRegistration{}, err
	}
	hostKey, err := DecodeBase64URL(message.HostKey, 32)
	if err != nil {
		return VerifiedRegistration{}, err
	}
	signingKey, err := DecodeBase64URL(message.SigningKey, ed25519.PublicKeySize)
	if err != nil {
		return VerifiedRegistration{}, err
	}
	signature, err := DecodeBase64URL(message.Signature, ed25519.SignatureSize)
	if err != nil {
		return VerifiedRegistration{}, err
	}
	if !bytes.Equal(RouteIDForHostKey(hostKey), routeID) {
		return VerifiedRegistration{}, ErrRouteMismatch
	}
	if !ed25519.Verify(signingKey, RegistrationPayload(nonce, routeID), signature) {
		return VerifiedRegistration{}, ErrBadSignature
	}
	verified := VerifiedRegistration{
		RouteID:    message.RouteID,
		SigningKey: ed25519.PublicKey(signingKey),
	}
	if issuer == nil {
		return verified, nil
	}
	credential, err := VerifyCredential(message.Credential, issuer, now)
	if err != nil {
		return VerifiedRegistration{}, err
	}
	verified.AccountID = credential.AccountID
	verified.ExpiresAt = credential.ExpiresAt
	return verified, nil
}

type CredentialClaims struct {
	Subject   string `json:"sub"`
	ExpiresAt string `json:"exp"`
	Relay     string `json:"relay"`
}

func IssueCredential(
	issuer ed25519.PrivateKey,
	accountID string,
	relayURL string,
	expiresAt time.Time,
) (string, error) {
	message, err := json.Marshal(CredentialClaims{
		Subject:   accountID,
		ExpiresAt: expiresAt.UTC().Format(time.RFC3339),
		Relay:     relayURL,
	})
	if err != nil {
		return "", err
	}
	return SignPasetoV4Public(issuer, message, []byte(credentialLabel)), nil
}

type VerifiedCredential struct {
	AccountID string
	ExpiresAt time.Time
}

func VerifyCredential(
	token string,
	issuer ed25519.PublicKey,
	now time.Time,
) (VerifiedCredential, error) {
	if token == "" {
		return VerifiedCredential{}, ErrCredentialMissing
	}
	message, err := VerifyPasetoV4Public(token, issuer, []byte(credentialLabel))
	if err != nil {
		return VerifiedCredential{}, ErrCredentialInvalid
	}
	var claims CredentialClaims
	if err := json.Unmarshal(message, &claims); err != nil || claims.Subject == "" {
		return VerifiedCredential{}, ErrCredentialInvalid
	}
	expires, err := time.Parse(time.RFC3339, claims.ExpiresAt)
	if err != nil {
		return VerifiedCredential{}, ErrCredentialInvalid
	}
	if !now.Before(expires) {
		return VerifiedCredential{}, ErrCredentialExpired
	}
	return VerifiedCredential{AccountID: claims.Subject, ExpiresAt: expires}, nil
}
