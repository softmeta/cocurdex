package relay_test

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/coder/websocket"
	"github.com/softmeta/cocurdex/services/relay/internal/relay"
)

func writeFile(t *testing.T, name, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(name), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(name, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func get(t *testing.T, url string) (*http.Response, string) {
	t.Helper()
	response, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	return response, string(body)
}

func TestServesTheWebClientBesideTheRelayRoutes(t *testing.T) {
	parent := t.TempDir()
	root := filepath.Join(parent, "web")
	writeFile(t, filepath.Join(root, "index.html"), "<!doctype html>app")
	writeFile(t, filepath.Join(root, "assets", "app-1a2b.js"), "console")
	writeFile(t, filepath.Join(parent, "secret.txt"), "secret")
	assets, err := relay.NewWebAssets(root)
	if err != nil {
		t.Fatal(err)
	}
	base := "http" + strings.TrimPrefix(startRelay(t, func(config *relay.Config) {
		config.WebAssets = assets
	}), "ws")

	page, body := get(t, base+"/?window=chat")
	if page.StatusCode != http.StatusOK || body != "<!doctype html>app" {
		t.Fatalf("index: %d %q", page.StatusCode, body)
	}
	if page.Header.Get("Cache-Control") != "no-cache" {
		t.Fatalf("index cache %q", page.Header.Get("Cache-Control"))
	}
	script, _ := get(t, base+"/assets/app-1a2b.js")
	if !strings.Contains(script.Header.Get("Cache-Control"), "immutable") {
		t.Fatalf("asset cache %q", script.Header.Get("Cache-Control"))
	}
	for _, path := range []string{"/assets/", "/missing.js", "/../secret.txt", "/%2e%2e/secret.txt"} {
		if response, _ := get(t, base+path); response.StatusCode != http.StatusNotFound {
			t.Fatalf("%s: status %d", path, response.StatusCode)
		}
	}
	if response, body := get(t, base+"/healthz"); response.StatusCode != http.StatusOK || body != "ok\n" {
		t.Fatalf("healthz: %d %q", response.StatusCode, body)
	}
	device := dial(t, "ws"+strings.TrimPrefix(base, "http")+"/v1/connect/"+newIdentity(t).routeID)
	if code := closeCode(t, device); code != relay.CloseHostOffline {
		t.Fatalf("close code %d", code)
	}
}

func TestRefusesAWebClientWithoutIndex(t *testing.T) {
	if _, err := relay.NewWebAssets(t.TempDir()); err == nil {
		t.Fatal("accepted a web root without index.html")
	}
}

func TestOnlyBrowserPagesFromTheRelayOriginMayConnect(t *testing.T) {
	base := startRelay(t, nil)
	host := mustRegister(t, base, newIdentity(t))
	acceptSessions(t, base, host, echoUpper)
	connect := base + "/v1/connect/" + host.routeID
	withOrigin := func(origin string) *websocket.DialOptions {
		return &websocket.DialOptions{HTTPHeader: http.Header{"Origin": {origin}}}
	}

	_, response, err := websocket.Dial(testContext(t), connect, withOrigin("https://pages.example.invalid"))
	if err == nil || response == nil || response.StatusCode != http.StatusForbidden {
		t.Fatalf("cross-origin page connected: %v", err)
	}
	sameOrigin := "http" + strings.TrimPrefix(base, "ws")
	device, _, err := websocket.Dial(testContext(t), connect, withOrigin(sameOrigin))
	if err != nil {
		t.Fatalf("same-origin page refused: %v", err)
	}
	device.CloseNow()
}
