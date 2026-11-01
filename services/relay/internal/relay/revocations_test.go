package relay_test

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/softmeta/cocurdex/services/relay/internal/relay"
)

type credentialRelay struct {
	base    string
	dataDir string
	server  *relay.Server
	issuer  ed25519.PrivateKey
	mu      sync.Mutex
	now     time.Time
}

func (r *credentialRelay) clock() time.Time {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.now
}

func (r *credentialRelay) advance(by time.Duration) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.now = r.now.Add(by)
}

func startCredentialRelay(t *testing.T) *credentialRelay {
	t.Helper()
	issuerPublic, issuer, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	dataDir := t.TempDir()
	revocations, err := relay.OpenRevocations(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	harness := &credentialRelay{
		dataDir: dataDir,
		issuer:  issuer,
		now:     time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC),
	}
	config := relay.DefaultConfig()
	config.HostLimiter = nil
	config.ConnectLimiter = nil
	config.CredentialIssuer = issuerPublic
	config.Revocations = revocations
	config.Now = harness.clock
	harness.server = relay.NewServer(config)
	httpServer := httptest.NewServer(harness.server)
	t.Cleanup(httpServer.Close)
	harness.base = "ws" + strings.TrimPrefix(httpServer.URL, "http")
	return harness
}

func (r *credentialRelay) registerAs(t *testing.T, account string, lifetime time.Duration) (testHost, error) {
	t.Helper()
	token, err := relay.IssueCredential(r.issuer, account, r.base, r.clock().Add(lifetime))
	if err != nil {
		t.Fatal(err)
	}
	host := newIdentity(t)
	conn, err := register(t, r.base, host, func(m *relay.RegisterMessage) { m.Credential = token })
	host.conn = conn
	return host, err
}

func TestRefusesRegistrationForARevokedAccountUntilItIsRestored(t *testing.T) {
	harness := startCredentialRelay(t)
	if err := relay.RevokeAccount(harness.dataDir, "invite-1", "leaked", harness.clock()); err != nil {
		t.Fatal(err)
	}

	_, err := harness.registerAs(t, "invite-1", time.Hour)
	if code := registrationCode(err); code != relay.CloseCredentialNeeded {
		t.Fatalf("close code %d, want %d", code, relay.CloseCredentialNeeded)
	}
	if _, err := harness.registerAs(t, "invite-2", time.Hour); err != nil {
		t.Fatalf("another account refused: %v", err)
	}

	restored, err := relay.RestoreAccount(harness.dataDir, "invite-1")
	if err != nil || !restored {
		t.Fatalf("restore: %v, %v", restored, err)
	}
	if _, err := harness.registerAs(t, "invite-1", time.Hour); err != nil {
		t.Fatalf("restored account refused: %v", err)
	}
}

func TestDisconnectsARevokedHostAndItsSessions(t *testing.T) {
	harness := startCredentialRelay(t)
	revoked, err := harness.registerAs(t, "invite-1", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	kept, err := harness.registerAs(t, "invite-2", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	hostClosed := make(chan websocket.StatusCode, 1)
	go func() {
		ctx := context.Background()
		for {
			var incoming relay.IncomingMessage
			if err := wsjson.Read(ctx, revoked.conn, &incoming); err != nil {
				hostClosed <- websocket.CloseStatus(err)
				return
			}
			conn, _, err := websocket.Dial(ctx, harness.base+"/v1/host/accept/"+incoming.Ticket, nil)
			if err != nil {
				return
			}
			go echoUpper(conn)
		}
	}()
	ctx := testContext(t)
	device := dial(t, harness.base+"/v1/connect/"+revoked.routeID)
	if err := device.Write(ctx, websocket.MessageBinary, []byte("ping")); err != nil {
		t.Fatal(err)
	}
	if _, reply, err := device.Read(ctx); err != nil || string(reply) != "PING" {
		t.Fatalf("reply %q, err %v", reply, err)
	}

	if err := relay.RevokeAccount(harness.dataDir, "invite-1", "", harness.clock()); err != nil {
		t.Fatal(err)
	}
	harness.server.SweepCredentials()

	if _, _, err := device.Read(ctx); err == nil {
		t.Fatal("the revoked host's session stayed open")
	}
	if code := <-hostClosed; code != relay.CloseCredentialNeeded {
		t.Fatalf("close code %d, want %d", code, relay.CloseCredentialNeeded)
	}
	other := dial(t, harness.base+"/v1/connect/"+kept.routeID)
	acceptSessions(t, harness.base, kept, echoUpper)
	if err := other.Write(ctx, websocket.MessageBinary, []byte("still")); err != nil {
		t.Fatal(err)
	}
	if _, reply, err := other.Read(ctx); err != nil || string(reply) != "STILL" {
		t.Fatalf("unrevoked host reply %q, err %v", reply, err)
	}
}

func TestDisconnectsAHostOnceItsCredentialExpires(t *testing.T) {
	harness := startCredentialRelay(t)
	short, err := harness.registerAs(t, "invite-short", time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	long, err := harness.registerAs(t, "invite-long", time.Hour)
	if err != nil {
		t.Fatal(err)
	}

	harness.server.SweepCredentials()
	harness.advance(time.Minute)
	harness.server.SweepCredentials()

	if code := closeCode(t, short.conn); code != relay.CloseCredentialNeeded {
		t.Fatalf("close code %d, want %d", code, relay.CloseCredentialNeeded)
	}
	ctx := testContext(t)
	acceptSessions(t, harness.base, long, echoUpper)
	device := dial(t, harness.base+"/v1/connect/"+long.routeID)
	if err := device.Write(ctx, websocket.MessageBinary, []byte("ok")); err != nil {
		t.Fatal(err)
	}
	if _, reply, err := device.Read(ctx); err != nil || string(reply) != "OK" {
		t.Fatalf("unexpired host reply %q, err %v", reply, err)
	}
}

func TestListsRevocationsInTheOrderTheyWereMade(t *testing.T) {
	dataDir := t.TempDir()
	first := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	if err := relay.RevokeAccount(dataDir, "b", "", first.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if err := relay.RevokeAccount(dataDir, "a", "abuse", first); err != nil {
		t.Fatal(err)
	}
	list, err := relay.ListRevocations(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 || list[0].Account != "a" || list[0].Reason != "abuse" || list[1].Account != "b" {
		t.Fatalf("list %+v", list)
	}
	if restored, err := relay.RestoreAccount(dataDir, "missing"); err != nil || restored {
		t.Fatalf("restoring an unknown account: %v, %v", restored, err)
	}
}
