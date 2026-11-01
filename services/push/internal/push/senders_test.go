package push

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestAPNsSendsAnEncryptedAlertOverHTTP2(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	var received atomic.Pointer[http.Request]
	var payload apnsPayload
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received.Store(r)
		_ = json.NewDecoder(r.Body).Decode(&payload)
		if strings.HasSuffix(r.URL.Path, "/gone") {
			w.WriteHeader(http.StatusGone)
			_, _ = w.Write([]byte(`{"reason":"Unregistered"}`))
		}
	}))
	server.EnableHTTP2 = true
	server.StartTLS()
	defer server.Close()
	sender, err := NewAPNsSender(APNsConfig{
		KeyID:      "KEY123",
		TeamID:     "TEAM123",
		Topic:      "dev.cocurdex.mobile",
		PrivateKey: key,
		Endpoints:  map[string]string{EnvironmentSandbox: server.URL},
		Client:     server.Client(),
	})
	if err != nil {
		t.Fatal(err)
	}
	err = sender.Send(context.Background(), Notification{
		Token:       "abcd",
		Environment: EnvironmentSandbox,
		Ciphertext:  "c1pher",
		CollapseID:  "request-1",
		ThreadID:    "host-thread",
		Priority:    PriorityHigh,
	})
	if err != nil {
		t.Fatal(err)
	}
	request := received.Load()
	if request.ProtoMajor != 2 || request.URL.Path != "/3/device/abcd" {
		t.Fatalf("unexpected request %s %s", request.Proto, request.URL.Path)
	}
	headers := map[string]string{
		"apns-topic":       "dev.cocurdex.mobile",
		"apns-push-type":   "alert",
		"apns-priority":    "10",
		"apns-collapse-id": "request-1",
	}
	for name, want := range headers {
		if got := request.Header.Get(name); got != want {
			t.Fatalf("%s = %q, want %q", name, got, want)
		}
	}
	verifyES256(t, strings.TrimPrefix(request.Header.Get("authorization"), "bearer "), &key.PublicKey)
	if payload.Ciphertext != "c1pher" || payload.Aps.MutableContent != 1 || payload.Aps.Alert.LocKey != FallbackLocKey {
		t.Fatalf("unexpected payload %+v", payload)
	}
	if payload.Aps.ThreadID != "host-thread" {
		t.Fatalf("thread id %q", payload.Aps.ThreadID)
	}
	gone := sender.Send(context.Background(), Notification{Token: "gone", Environment: EnvironmentSandbox})
	if !errors.Is(gone, ErrUnregistered) {
		t.Fatalf("410 maps to %v", gone)
	}
	production := sender.Send(context.Background(), Notification{Token: "x", Environment: EnvironmentProduction})
	if !errors.Is(production, ErrUpstream) {
		t.Fatalf("unconfigured environment maps to %v", production)
	}
}

func verifyES256(t *testing.T, token string, key *ecdsa.PublicKey) {
	t.Helper()
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("provider token %q", token)
	}
	signature, err := DecodeBase64URL(parts[2], 64)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	r := new(big.Int).SetBytes(signature[:32])
	s := new(big.Int).SetBytes(signature[32:])
	if !ecdsa.Verify(key, digest[:], r, s) {
		t.Fatal("provider token signature does not verify")
	}
	claims, _ := DecodeBase64URL(parts[1], 0)
	if !strings.Contains(string(claims), `"iss":"TEAM123"`) {
		t.Fatalf("claims %s", claims)
	}
}

func TestFCMSendsADataMessageWithACachedAccessToken(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	var tokenRequests atomic.Int32
	var message map[string]fcmMessage
	var authorization atomic.Value
	mux := http.NewServeMux()
	mux.HandleFunc("POST /token", func(w http.ResponseWriter, r *http.Request) {
		tokenRequests.Add(1)
		_ = r.ParseForm()
		if r.PostForm.Get("grant_type") != "urn:ietf:params:oauth:grant-type:jwt-bearer" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		_, _ = w.Write([]byte(`{"access_token":"access-1","expires_in":3600}`))
	})
	mux.HandleFunc("POST /v1/projects/demo/messages:send", func(w http.ResponseWriter, r *http.Request) {
		authorization.Store(r.Header.Get("authorization"))
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &message)
		if message["message"].Token == "stale" {
			w.WriteHeader(http.StatusNotFound)
			_, _ = w.Write([]byte(`{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}`))
		}
	})
	server := httptest.NewServer(mux)
	defer server.Close()
	now := time.Unix(1_800_000_000, 0)
	sender, err := NewFCMSender(FCMConfig{
		Account: ServiceAccount{
			ProjectID:   "demo",
			ClientEmail: "push@demo.iam.example.invalid",
			PrivateKey:  string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der})),
			TokenURI:    server.URL + "/token",
		},
		Endpoint: server.URL,
		Now:      func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	notification := Notification{
		Token:      "device-token",
		Ciphertext: "c1pher",
		CollapseID: "request-1",
		Priority:   PriorityHigh,
		ExpiresAt:  now.Add(time.Hour).Unix(),
	}
	for range 2 {
		if err := sender.Send(context.Background(), notification); err != nil {
			t.Fatal(err)
		}
	}
	if tokenRequests.Load() != 1 {
		t.Fatalf("token requested %d times", tokenRequests.Load())
	}
	if authorization.Load() != "Bearer access-1" {
		t.Fatalf("authorization %v", authorization.Load())
	}
	sent := message["message"]
	if sent.Data["c"] != "c1pher" || sent.Android.Priority != "HIGH" || sent.Android.CollapseKey != "request-1" || sent.Android.TTL != "3600s" {
		t.Fatalf("unexpected message %+v", sent)
	}
	stale := sender.Send(context.Background(), Notification{Token: "stale", Ciphertext: "c"})
	if !errors.Is(stale, ErrUnregistered) {
		t.Fatalf("UNREGISTERED maps to %v", stale)
	}
}
