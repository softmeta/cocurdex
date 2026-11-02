package relay

import (
	"bytes"
	"crypto/ecdh"
	"crypto/ed25519"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"time"
)

const credentialLabel = "cocurdex-relay-credential/2"

var (
	ErrRouteMismatch     = errors.New("route id does not match the host key")
	ErrBadSignature      = errors.New("signature does not verify")
	ErrBadProof          = errors.New("registration does not prove the host key")
	ErrCredentialMissing = errors.New("a relay credential is required")
	ErrCredentialInvalid = errors.New("the relay credential is not valid")
	ErrCredentialExpired = errors.New("the relay credential has expired")
)

func RouteIDForHostKey(hostKey []byte) []byte {
	digest := sha256.Sum256(hostKey)
	return digest[:RouteIDLength]
}

func RegistrationPayload(nonce, routeID, relayKey []byte) []byte {
	payload := make([]byte, 0, len(ProtocolVersion)+len(nonce)+len(routeID)+len(relayKey))
	payload = append(payload, ProtocolVersion...)
	payload = append(payload, nonce...)
	payload = append(payload, routeID...)
	return append(payload, relayKey...)
}

func RegistrationProof(sharedSecret, nonce, routeID, relayKey []byte) []byte {
	mac := hmac.New(sha256.New, sharedSecret)
	mac.Write(RegistrationPayload(nonce, routeID, relayKey))
	return mac.Sum(nil)
}

func ProveHostKey(hostKey *ecdh.PrivateKey, relayKey, nonce []byte) ([]byte, error) {
	peer, err := ecdh.X25519().NewPublicKey(relayKey)
	if err != nil {
		return nil, err
	}
	shared, err := hostKey.ECDH(peer)
	if err != nil {
		return nil, err
	}
	routeID := RouteIDForHostKey(hostKey.PublicKey().Bytes())
	return RegistrationProof(shared, nonce, routeID, relayKey), nil
}

type VerifiedRegistration struct {
	RouteID   string
	AccountID string
	ExpiresAt time.Time
}

func VerifyRegistration(
	message RegisterMessage,
	nonce []byte,
	relayKey *ecdh.PrivateKey,
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
	proof, err := DecodeBase64URL(message.Proof, sha256.Size)
	if err != nil {
		return VerifiedRegistration{}, err
	}
	if !bytes.Equal(RouteIDForHostKey(hostKey), routeID) {
		return VerifiedRegistration{}, ErrRouteMismatch
	}
	host, err := ecdh.X25519().NewPublicKey(hostKey)
	if err != nil {
		return VerifiedRegistration{}, err
	}
	shared, err := relayKey.ECDH(host)
	if err != nil {
		return VerifiedRegistration{}, ErrBadProof
	}
	expected := RegistrationProof(shared, nonce, routeID, relayKey.PublicKey().Bytes())
	if !hmac.Equal(expected, proof) {
		return VerifiedRegistration{}, ErrBadProof
	}
	verified := VerifiedRegistration{RouteID: message.RouteID}
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
