package push

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

type recordingSender struct {
	mu   sync.Mutex
	sent []Notification
	err  error
}

func (s *recordingSender) Send(_ context.Context, notification Notification) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.err != nil {
		return s.err
	}
	s.sent = append(s.sent, notification)
	return nil
}

const apnsToken = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"

type harness struct {
	t      *testing.T
	server *Server
	sender *recordingSender
	now    time.Time
}

func newSealer(t *testing.T, current byte, ids ...byte) *HandleSealer {
	t.Helper()
	keys := map[byte][]byte{}
	for _, id := range ids {
		key := make([]byte, HandleKeyLength)
		key[0] = id
		keys[id] = key
	}
	sealer, err := NewHandleSealer(current, keys)
	if err != nil {
		t.Fatal(err)
	}
	return sealer
}

func newHarness(t *testing.T, mutate func(*Config)) *harness {
	t.Helper()
	h := &harness{t: t, sender: &recordingSender{}, now: time.Unix(1_800_000_000, 0)}
	config := DefaultConfig()
	config.Sealer = newSealer(t, 1, 1)
	config.Senders = map[string]Sender{PlatformAPNs: h.sender}
	config.Now = func() time.Time { return h.now }
	if mutate != nil {
		mutate(&config)
	}
	h.server = NewServer(config)
	return h
}

func newHostKey(t *testing.T) ed25519.PrivateKey {
	t.Helper()
	_, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return private
}

func (h *harness) call(key ed25519.PrivateKey, path string, body any, timestamp int64) *httptest.ResponseRecorder {
	h.t.Helper()
	encoded, err := json.Marshal(body)
	if err != nil {
		h.t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(encoded))
	request.Header.Set("Authorization", SignRequest(key, http.MethodPost, path, timestamp, encoded))
	recorder := httptest.NewRecorder()
	h.server.ServeHTTP(recorder, request)
	return recorder
}

func (h *harness) issue(key ed25519.PrivateKey) string {
	h.t.Helper()
	response := h.call(key, "/v1/handles", HandleRequest{
		Platform:    PlatformAPNs,
		Token:       apnsToken,
		Environment: EnvironmentSandbox,
	}, h.now.Unix())
	if response.Code != http.StatusOK {
		h.t.Fatalf("issue handle: %d %s", response.Code, response.Body)
	}
	var issued HandleResponse
	if err := json.Unmarshal(response.Body.Bytes(), &issued); err != nil {
		h.t.Fatal(err)
	}
	return issued.Handle
}

func ciphertext() string {
	return EncodeBase64URL(bytes.Repeat([]byte{7}, 96))
}

func pushBody(handle string) PushRequest {
	return PushRequest{Handle: handle, Ciphertext: ciphertext(), CollapseID: "request-1"}
}

func errorCode(t *testing.T, response *httptest.ResponseRecorder) string {
	t.Helper()
	var failure ErrorResponse
	_ = json.Unmarshal(response.Body.Bytes(), &failure)
	return failure.Error
}

func TestIssuedHandleDeliversToTheBoundToken(t *testing.T) {
	h := newHarness(t, nil)
	host := newHostKey(t)
	handle := h.issue(host)
	response := h.call(host, "/v1/push", pushBody(handle), h.now.Unix())
	if response.Code != http.StatusAccepted {
		t.Fatalf("push: %d %s", response.Code, response.Body)
	}
	if len(h.sender.sent) != 1 {
		t.Fatalf("sent %d notifications", len(h.sender.sent))
	}
	sent := h.sender.sent[0]
	if sent.Token != apnsToken || sent.Environment != EnvironmentSandbox {
		t.Fatalf("unexpected destination %+v", sent)
	}
	if sent.Ciphertext != ciphertext() || sent.CollapseID != "request-1" || sent.Priority != PriorityHigh {
		t.Fatalf("unexpected notification %+v", sent)
	}
}

func TestHandleCannotBeUsedByAnotherHost(t *testing.T) {
	h := newHarness(t, nil)
	handle := h.issue(newHostKey(t))
	response := h.call(newHostKey(t), "/v1/push", pushBody(handle), h.now.Unix())
	if response.Code != http.StatusForbidden || len(h.sender.sent) != 0 {
		t.Fatalf("another host pushed: %d, sent %d", response.Code, len(h.sender.sent))
	}
}

func TestStaleOrForgedSignaturesAreRejected(t *testing.T) {
	h := newHarness(t, nil)
	host := newHostKey(t)
	handle := h.issue(host)
	stale := h.call(host, "/v1/push", pushBody(handle), h.now.Add(-6*time.Minute).Unix())
	if stale.Code != http.StatusUnauthorized {
		t.Fatalf("stale signature: %d", stale.Code)
	}
	encoded, _ := json.Marshal(pushBody(handle))
	request := httptest.NewRequest(http.MethodPost, "/v1/push", bytes.NewReader(encoded))
	request.Header.Set("Authorization", SignRequest(host, http.MethodPost, "/v1/handles", h.now.Unix(), encoded))
	recorder := httptest.NewRecorder()
	h.server.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusUnauthorized || len(h.sender.sent) != 0 {
		t.Fatalf("signature for another path: %d", recorder.Code)
	}
}

func TestRetiredHandleKeyReportsUnregistered(t *testing.T) {
	h := newHarness(t, nil)
	host := newHostKey(t)
	handle := h.issue(host)
	h.server.config.Sealer = newSealer(t, 2, 2)
	response := h.call(host, "/v1/push", pushBody(handle), h.now.Unix())
	if response.Code != http.StatusGone || errorCode(t, response) != "unregistered" {
		t.Fatalf("retired key: %d %s", response.Code, response.Body)
	}
}

func TestRotatedSealerStillOpensOlderHandles(t *testing.T) {
	h := newHarness(t, nil)
	host := newHostKey(t)
	handle := h.issue(host)
	rotated := newSealer(t, 2, 1, 2)
	h.server.config.Sealer = rotated
	response := h.call(host, "/v1/push", pushBody(handle), h.now.Unix())
	if response.Code != http.StatusAccepted {
		t.Fatalf("older handle after rotation: %d %s", response.Code, response.Body)
	}
	fresh := h.issue(host)
	claims, err := rotated.Open(fresh)
	if err != nil || claims.Token != apnsToken {
		t.Fatalf("fresh handle: %v %+v", err, claims)
	}
}

func TestUnregisteredTokenIsReported(t *testing.T) {
	h := newHarness(t, nil)
	host := newHostKey(t)
	handle := h.issue(host)
	h.sender.err = ErrUnregistered
	response := h.call(host, "/v1/push", pushBody(handle), h.now.Unix())
	if response.Code != http.StatusGone || errorCode(t, response) != "unregistered" {
		t.Fatalf("unregistered: %d %s", response.Code, response.Body)
	}
}

func TestDeviceRateLimitStopsBursts(t *testing.T) {
	h := newHarness(t, func(config *Config) {
		config.DeviceLimiter = NewRateLimiter(1.0/60.0, 2, nil)
	})
	host := newHostKey(t)
	handle := h.issue(host)
	codes := []int{}
	for range 3 {
		codes = append(codes, h.call(host, "/v1/push", pushBody(handle), h.now.Unix()).Code)
	}
	if codes[0] != http.StatusAccepted || codes[1] != http.StatusAccepted || codes[2] != http.StatusTooManyRequests {
		t.Fatalf("codes %v", codes)
	}
}

func TestUnconfiguredPlatformAndBadTokensAreRefused(t *testing.T) {
	h := newHarness(t, nil)
	host := newHostKey(t)
	fcm := h.call(host, "/v1/handles", HandleRequest{Platform: PlatformFCM, Token: "abc"}, h.now.Unix())
	if fcm.Code != http.StatusNotImplemented {
		t.Fatalf("fcm without credentials: %d", fcm.Code)
	}
	bad := h.call(host, "/v1/handles", HandleRequest{Platform: PlatformAPNs, Token: "../evil"}, h.now.Unix())
	if bad.Code != http.StatusBadRequest {
		t.Fatalf("bad apns token: %d", bad.Code)
	}
	tooLarge := h.call(host, "/v1/push", PushRequest{
		Handle:     h.issue(host),
		Ciphertext: EncodeBase64URL(make([]byte, MaxCiphertextBytes+1)),
	}, h.now.Unix())
	if tooLarge.Code != http.StatusBadRequest {
		t.Fatalf("oversized ciphertext: %d", tooLarge.Code)
	}
}
