package relay_test

import (
	"crypto/ed25519"
	"encoding/hex"
	"errors"
	"testing"

	"github.com/softmeta/cocurdex/services/relay/internal/relay"
)

const (
	vectorSeed    = "b4cbfb43df4ce210727d953e4a713307fa19bb7d9f85041438d9e11b942a3774"
	vectorPayload = `{"data":"this is a signed message","exp":"2022-01-01T00:00:00+00:00"}`
	vectorToken   = "v4.public.eyJkYXRhIjoidGhpcyBpcyBhIHNpZ25lZCBtZXNzYWdlIiwiZXhwIjoiMjAyMi0wMS0wMVQwMDowMDowMCswMDowMCJ9bg_XBBzds8lTZShVlwwKSgeKpLT3yukTw6JUz3W4h_ExsQV-P0V54zemZDcAxFaSeef1QlXEFtkqxT1ciiQEDA"
)

func vectorKey(t *testing.T) ed25519.PrivateKey {
	t.Helper()
	seed, err := hex.DecodeString(vectorSeed)
	if err != nil {
		t.Fatal(err)
	}
	return ed25519.NewKeyFromSeed(seed)
}

func TestSignsTheOfficialV4PublicVector(t *testing.T) {
	token := relay.SignPasetoV4Public(vectorKey(t), []byte(vectorPayload), nil)
	if token != vectorToken {
		t.Fatalf("token %q, want the 4-S-1 vector", token)
	}
}

func TestVerifiesOnlyWithTheMatchingKeyAndAssertion(t *testing.T) {
	key := vectorKey(t)
	public := key.Public().(ed25519.PublicKey)
	message, err := relay.VerifyPasetoV4Public(vectorToken, public, nil)
	if err != nil || string(message) != vectorPayload {
		t.Fatalf("message %q, err %v", message, err)
	}
	_, err = relay.VerifyPasetoV4Public(vectorToken, public, []byte("other-service"))
	if !errors.Is(err, relay.ErrBadSignature) {
		t.Fatalf("err %v, want a bad signature under another implicit assertion", err)
	}
}
