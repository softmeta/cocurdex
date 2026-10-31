package relay

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"errors"
	"strconv"
	"time"
)

const credentialLabel = "cocurdex-relay-credential/1"

type Credential struct {
	AccountID string `json:"accountId"`
	ExpiresAt int64  `json:"expiresAt"`
	Signature string `json:"signature"`
}

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
	accountID, err := VerifyCredential(message.Credential, issuer, now)
	if err != nil {
		return VerifiedRegistration{}, err
	}
	verified.AccountID = accountID
	return verified, nil
}

func CredentialPayload(accountID string, expiresAt int64) []byte {
	payload := make([]byte, 0, len(credentialLabel)+len(accountID)+24)
	payload = append(payload, credentialLabel...)
	payload = append(payload, 0)
	payload = append(payload, accountID...)
	payload = append(payload, 0)
	return strconv.AppendInt(payload, expiresAt, 10)
}

func IssueCredential(
	issuer ed25519.PrivateKey,
	accountID string,
	expiresAt time.Time,
) Credential {
	expires := expiresAt.Unix()
	signature := ed25519.Sign(issuer, CredentialPayload(accountID, expires))
	return Credential{
		AccountID: accountID,
		ExpiresAt: expires,
		Signature: EncodeBase64URL(signature),
	}
}

func VerifyCredential(
	credential *Credential,
	issuer ed25519.PublicKey,
	now time.Time,
) (string, error) {
	if credential == nil {
		return "", ErrCredentialMissing
	}
	signature, err := DecodeBase64URL(credential.Signature, ed25519.SignatureSize)
	if err != nil || credential.AccountID == "" {
		return "", ErrCredentialInvalid
	}
	payload := CredentialPayload(credential.AccountID, credential.ExpiresAt)
	if !ed25519.Verify(issuer, payload, signature) {
		return "", ErrCredentialInvalid
	}
	if now.Unix() >= credential.ExpiresAt {
		return "", ErrCredentialExpired
	}
	return credential.AccountID, nil
}
