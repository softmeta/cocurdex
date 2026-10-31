package relay_test

import (
	"context"
	"crypto/ecdh"
	"crypto/ed25519"
	"crypto/rand"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"github.com/softmeta/cocurdex/services/relay/internal/relay"
)

type testHost struct {
	hostKey    []byte
	routeID    string
	signingKey ed25519.PrivateKey
	conn       *websocket.Conn
}

func newIdentity(t *testing.T) testHost {
	t.Helper()
	noise, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	_, signing, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	hostKey := noise.PublicKey().Bytes()
	return testHost{
		hostKey:    hostKey,
		routeID:    relay.EncodeBase64URL(relay.RouteIDForHostKey(hostKey)),
		signingKey: signing,
	}
}

func startRelay(t *testing.T, configure func(*relay.Config)) string {
	t.Helper()
	config := relay.DefaultConfig()
	config.HostLimiter = nil
	config.ConnectLimiter = nil
	if configure != nil {
		configure(&config)
	}
	server := httptest.NewServer(relay.NewServer(config))
	t.Cleanup(server.Close)
	return "ws" + strings.TrimPrefix(server.URL, "http")
}

func testContext(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	t.Cleanup(cancel)
	return ctx
}

func dial(t *testing.T, url string) *websocket.Conn {
	t.Helper()
	conn, _, err := websocket.Dial(testContext(t), url, nil)
	if err != nil {
		t.Fatalf("dial %s: %v", url, err)
	}
	conn.SetReadLimit(relay.MaxMessageBytes)
	t.Cleanup(func() { conn.CloseNow() })
	return conn
}

func registration(host testHost, nonce []byte) relay.RegisterMessage {
	routeID, _ := relay.DecodeBase64URL(host.routeID, relay.RouteIDLength)
	signature := ed25519.Sign(host.signingKey, relay.RegistrationPayload(nonce, routeID))
	return relay.RegisterMessage{
		Type:       "register",
		RouteID:    host.routeID,
		HostKey:    relay.EncodeBase64URL(host.hostKey),
		SigningKey: relay.EncodeBase64URL(host.signingKey.Public().(ed25519.PublicKey)),
		Signature:  relay.EncodeBase64URL(signature),
	}
}

func register(
	t *testing.T,
	base string,
	host testHost,
	edit func(*relay.RegisterMessage),
) (*websocket.Conn, error) {
	t.Helper()
	ctx := testContext(t)
	conn := dial(t, base+"/v1/host")
	var challenge relay.ChallengeMessage
	if err := wsjson.Read(ctx, conn, &challenge); err != nil {
		t.Fatal(err)
	}
	nonce, err := relay.DecodeBase64URL(challenge.Nonce, relay.NonceLength)
	if err != nil {
		t.Fatal(err)
	}
	message := registration(host, nonce)
	if edit != nil {
		edit(&message)
	}
	if err := wsjson.Write(ctx, conn, message); err != nil {
		t.Fatal(err)
	}
	var registered relay.RegisteredMessage
	if err := wsjson.Read(ctx, conn, &registered); err != nil {
		return conn, err
	}
	if registered.RouteID != host.routeID {
		t.Fatalf("registered %q, want %q", registered.RouteID, host.routeID)
	}
	return conn, nil
}

func mustRegister(t *testing.T, base string, host testHost) testHost {
	t.Helper()
	conn, err := register(t, base, host, nil)
	if err != nil {
		t.Fatalf("register: %v", err)
	}
	host.conn = conn
	return host
}

func acceptSessions(t *testing.T, base string, host testHost, handle func(*websocket.Conn)) {
	t.Helper()
	go func() {
		ctx := context.Background()
		for {
			var incoming relay.IncomingMessage
			if err := wsjson.Read(ctx, host.conn, &incoming); err != nil {
				return
			}
			conn, _, err := websocket.Dial(ctx, base+"/v1/host/accept/"+incoming.Ticket, nil)
			if err != nil {
				return
			}
			conn.SetReadLimit(relay.MaxMessageBytes)
			go handle(conn)
		}
	}()
}

func echoUpper(conn *websocket.Conn) {
	ctx := context.Background()
	defer conn.CloseNow()
	for {
		kind, data, err := conn.Read(ctx)
		if err != nil {
			return
		}
		if err := conn.Write(ctx, kind, []byte(strings.ToUpper(string(data)))); err != nil {
			return
		}
	}
}

func closeCode(t *testing.T, conn *websocket.Conn) websocket.StatusCode {
	t.Helper()
	_, _, err := conn.Read(testContext(t))
	if err == nil {
		t.Fatal("expected the connection to close")
	}
	return websocket.CloseStatus(err)
}

func registrationCode(err error) websocket.StatusCode {
	return websocket.CloseStatus(err)
}

func TestRelaysBinaryMessagesBothWays(t *testing.T) {
	base := startRelay(t, nil)
	host := mustRegister(t, base, newIdentity(t))
	acceptSessions(t, base, host, echoUpper)
	ctx := testContext(t)

	device := dial(t, base+"/v1/connect/"+host.routeID)
	for _, message := range []string{"hello", strings.Repeat("x", 65535)} {
		if err := device.Write(ctx, websocket.MessageBinary, []byte(message)); err != nil {
			t.Fatal(err)
		}
		_, reply, err := device.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if string(reply) != strings.ToUpper(message) {
			t.Fatalf("reply %d bytes, want %d", len(reply), len(message))
		}
	}
}

func TestAgreesOnTheSecureChannelSubprotocol(t *testing.T) {
	base := startRelay(t, nil)
	host := mustRegister(t, base, newIdentity(t))
	accepted := make(chan string, 1)
	go func() {
		ctx := context.Background()
		var incoming relay.IncomingMessage
		if err := wsjson.Read(ctx, host.conn, &incoming); err != nil {
			accepted <- ""
			return
		}
		options := &websocket.DialOptions{Subprotocols: []string{relay.ChannelSubprotocol}}
		conn, _, err := websocket.Dial(ctx, base+"/v1/host/accept/"+incoming.Ticket, options)
		if err != nil {
			accepted <- ""
			return
		}
		accepted <- conn.Subprotocol()
		conn.CloseNow()
	}()
	options := &websocket.DialOptions{Subprotocols: []string{relay.ChannelSubprotocol}}
	device, _, err := websocket.Dial(testContext(t), base+"/v1/connect/"+host.routeID, options)
	if err != nil {
		t.Fatal(err)
	}
	defer device.CloseNow()
	if device.Subprotocol() != relay.ChannelSubprotocol {
		t.Fatalf("device subprotocol %q", device.Subprotocol())
	}
	if got := <-accepted; got != relay.ChannelSubprotocol {
		t.Fatalf("host subprotocol %q", got)
	}
}

func TestDeviceSeesOfflineWhenNoHostIsRegistered(t *testing.T) {
	base := startRelay(t, nil)
	device := dial(t, base+"/v1/connect/"+newIdentity(t).routeID)

	if code := closeCode(t, device); code != relay.CloseHostOffline {
		t.Fatalf("close code %d, want %d", code, relay.CloseHostOffline)
	}
}

func TestRefusesRegistrationsThatDoNotProveTheHostKey(t *testing.T) {
	base := startRelay(t, nil)
	other := newIdentity(t)
	cases := map[string]func(*relay.RegisterMessage){
		"wrong signature": func(m *relay.RegisterMessage) {
			m.Signature = relay.EncodeBase64URL(make([]byte, ed25519.SignatureSize))
		},
		"route of another host key": func(m *relay.RegisterMessage) {
			m.HostKey = relay.EncodeBase64URL(other.hostKey)
		},
	}
	for name, edit := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := register(t, base, newIdentity(t), edit)
			if code := registrationCode(err); code != relay.CloseUnauthorized {
				t.Fatalf("close code %d, want %d", code, relay.CloseUnauthorized)
			}
		})
	}
}

func TestKeepsARouteBoundToItsFirstSigningKeyAcrossRestarts(t *testing.T) {
	dataDir := t.TempDir()
	owner := newIdentity(t)
	bindings, err := relay.OpenBindings(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	first := startRelay(t, func(c *relay.Config) { c.Bindings = bindings })
	mustRegister(t, first, owner)

	reopened, err := relay.OpenBindings(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	restarted := startRelay(t, func(c *relay.Config) { c.Bindings = reopened })
	squatter := owner
	_, squatter.signingKey, _ = ed25519.GenerateKey(rand.Reader)

	_, err = register(t, restarted, squatter, nil)
	if code := registrationCode(err); code != relay.CloseRouteTaken {
		t.Fatalf("close code %d, want %d", code, relay.CloseRouteTaken)
	}
	mustRegister(t, restarted, owner)
}

func TestANewRegistrationReplacesTheOldControlConnection(t *testing.T) {
	base := startRelay(t, nil)
	identity := newIdentity(t)
	stale := mustRegister(t, base, identity)
	fresh := mustRegister(t, base, identity)
	acceptSessions(t, base, fresh, echoUpper)

	if code := closeCode(t, stale.conn); code != relay.CloseReplaced {
		t.Fatalf("close code %d, want %d", code, relay.CloseReplaced)
	}
	ctx := testContext(t)
	device := dial(t, base+"/v1/connect/"+identity.routeID)
	if err := device.Write(ctx, websocket.MessageBinary, []byte("ping")); err != nil {
		t.Fatal(err)
	}
	if _, reply, err := device.Read(ctx); err != nil || string(reply) != "PING" {
		t.Fatalf("reply %q, err %v", reply, err)
	}
}

func TestRequiresAValidCredentialWhenAnIssuerIsConfigured(t *testing.T) {
	issuerPublic, issuer, _ := ed25519.GenerateKey(rand.Reader)
	_, stranger, _ := ed25519.GenerateKey(rand.Reader)
	now := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	base := startRelay(t, func(c *relay.Config) {
		c.CredentialIssuer = issuerPublic
		c.Now = func() time.Time { return now }
	})
	valid := relay.IssueCredential(issuer, "invite-1", now.Add(time.Hour))
	expired := relay.IssueCredential(issuer, "invite-1", now.Add(-time.Second))
	forged := relay.IssueCredential(stranger, "invite-1", now.Add(time.Hour))
	cases := map[string]*relay.Credential{
		"missing": nil,
		"expired": &expired,
		"forged":  &forged,
	}
	for name, credential := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := register(t, base, newIdentity(t), func(m *relay.RegisterMessage) {
				m.Credential = credential
			})
			if code := registrationCode(err); code != relay.CloseCredentialNeeded {
				t.Fatalf("close code %d, want %d", code, relay.CloseCredentialNeeded)
			}
		})
	}
	_, err := register(t, base, newIdentity(t), func(m *relay.RegisterMessage) {
		m.Credential = &valid
	})
	if err != nil {
		t.Fatalf("valid credential refused: %v", err)
	}
}

func TestClosesTheDeviceWhenTheHostNeverAccepts(t *testing.T) {
	base := startRelay(t, func(c *relay.Config) { c.HostAcceptTimeout = 200 * time.Millisecond })
	host := mustRegister(t, base, newIdentity(t))
	device := dial(t, base+"/v1/connect/"+host.routeID)

	if code := closeCode(t, device); code != relay.CloseHostTimeout {
		t.Fatalf("close code %d, want %d", code, relay.CloseHostTimeout)
	}
}

func TestClosesBothEndsWhenADeviceSendsText(t *testing.T) {
	base := startRelay(t, nil)
	host := mustRegister(t, base, newIdentity(t))
	hostSide := make(chan *websocket.Conn, 1)
	acceptSessions(t, base, host, func(conn *websocket.Conn) { hostSide <- conn })
	ctx := testContext(t)
	device := dial(t, base+"/v1/connect/"+host.routeID)
	if err := device.Write(ctx, websocket.MessageText, []byte("plain")); err != nil {
		t.Fatal(err)
	}

	if code := closeCode(t, device); code != relay.CloseProtocolError {
		t.Fatalf("device close code %d, want %d", code, relay.CloseProtocolError)
	}
	if code := closeCode(t, <-hostSide); code != relay.CloseProtocolError {
		t.Fatalf("host close code %d, want %d", code, relay.CloseProtocolError)
	}
}

func TestPassesTheClosingSideStatusToTheOtherSide(t *testing.T) {
	base := startRelay(t, nil)
	host := mustRegister(t, base, newIdentity(t))
	acceptSessions(t, base, host, func(conn *websocket.Conn) {
		conn.Close(websocket.StatusCode(4100), "revoked")
	})
	device := dial(t, base+"/v1/connect/"+host.routeID)

	if code := closeCode(t, device); code != 4100 {
		t.Fatalf("close code %d, want 4100", code)
	}
}

func TestLimitsConcurrentSessionsPerHost(t *testing.T) {
	base := startRelay(t, func(c *relay.Config) { c.MaxSessionsPerRoute = 1 })
	host := mustRegister(t, base, newIdentity(t))
	acceptSessions(t, base, host, echoUpper)
	ctx := testContext(t)
	first := dial(t, base+"/v1/connect/"+host.routeID)
	if err := first.Write(ctx, websocket.MessageBinary, []byte("a")); err != nil {
		t.Fatal(err)
	}
	if _, _, err := first.Read(ctx); err != nil {
		t.Fatal(err)
	}

	second := dial(t, base+"/v1/connect/"+host.routeID)
	if code := closeCode(t, second); code != relay.CloseTooManySessions {
		t.Fatalf("close code %d, want %d", code, relay.CloseTooManySessions)
	}
}

func TestRateLimitsDeviceConnectionsPerAddress(t *testing.T) {
	base := startRelay(t, func(c *relay.Config) {
		c.ConnectLimiter = relay.NewRateLimiter(0.001, 2, nil)
	})
	route := newIdentity(t).routeID
	codes := []websocket.StatusCode{}
	for range 3 {
		codes = append(codes, closeCode(t, dial(t, base+"/v1/connect/"+route)))
	}

	want := []websocket.StatusCode{relay.CloseHostOffline, relay.CloseHostOffline, relay.CloseRateLimited}
	for i := range want {
		if codes[i] != want[i] {
			t.Fatalf("close codes %v, want %v", codes, want)
		}
	}
}

func TestRejectsUnknownAcceptTickets(t *testing.T) {
	base := startRelay(t, nil)
	_, response, err := websocket.Dial(testContext(t), base+"/v1/host/accept/unknown", nil)
	if err == nil || response == nil || response.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for an unknown ticket, got %v", err)
	}
}
