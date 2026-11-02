package relay_test

import (
	"crypto/ed25519"
	"crypto/rand"
	"strings"
	"testing"
	"time"

	"github.com/softmeta/cocurdex/services/relay/internal/relay"
)

func httpBase(socketBase string) string {
	return "http" + strings.TrimPrefix(socketBase, "ws")
}

func TestSmokeCarriesBytesThroughAnOpenRelay(t *testing.T) {
	base := startRelay(t, nil)

	result, err := relay.Smoke(testContext(t), httpBase(base), "")
	if err != nil {
		t.Fatal(err)
	}
	if !result.Bridged || result.Protocol != relay.WireProtocol || result.Version == "" {
		t.Fatalf("result %+v", result)
	}
}

func TestSmokeStopsAtTheCredentialCheckWithoutACredential(t *testing.T) {
	public, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	base := startRelay(t, func(config *relay.Config) { config.CredentialIssuer = public })

	result, err := relay.Smoke(testContext(t), httpBase(base), "")
	if err != nil {
		t.Fatal(err)
	}
	if result.Bridged {
		t.Fatalf("result %+v", result)
	}
}

func TestSmokeBridgesWithAValidCredential(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	base := startRelay(t, func(config *relay.Config) { config.CredentialIssuer = public })
	credential, err := relay.IssueCredential(private, "smoke", httpBase(base), time.Now().Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}

	result, err := relay.Smoke(testContext(t), httpBase(base), credential)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Bridged {
		t.Fatalf("result %+v", result)
	}
}

func TestSmokeFailsWhenTheCredentialIsRefused(t *testing.T) {
	public, _, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	base := startRelay(t, func(config *relay.Config) { config.CredentialIssuer = public })

	if _, err := relay.Smoke(testContext(t), httpBase(base), "v4.public.bogus"); err == nil {
		t.Fatal("expected a refused credential to fail the smoke test")
	}
}
