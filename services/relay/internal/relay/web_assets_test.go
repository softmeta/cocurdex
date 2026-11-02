package relay_test

import (
	"io"
	"net/http"
	"net/http/httptest"
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

func openWebAssets(t *testing.T, dir string) *relay.WebAssets {
	t.Helper()
	assets, err := relay.NewWebAssets(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { assets.Close() })
	return assets
}

func scriptPolicy(t *testing.T, index string) string {
	t.Helper()
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "index.html"), index)
	recorder := httptest.NewRecorder()
	openWebAssets(t, root).ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/", nil))
	for _, directive := range strings.Split(recorder.Header().Get("Content-Security-Policy"), "; ") {
		if strings.HasPrefix(directive, "script-src ") {
			return directive
		}
	}
	t.Fatal("no script-src directive")
	return ""
}

func TestHashesInlineScriptsWithTheLineEndingsBrowsersParse(t *testing.T) {
	unix := scriptPolicy(t, "<script>\nboot()\n</script>")
	windows := scriptPolicy(t, "<script>\r\nboot()\r\n</script>")
	if unix != windows {
		t.Fatalf("CRLF policy %q differs from LF policy %q", windows, unix)
	}
}

func TestServesTheWebClientBesideTheRelayRoutes(t *testing.T) {
	parent := t.TempDir()
	root := filepath.Join(parent, "web")
	writeFile(t, filepath.Join(root, "index.html"), "<!doctype html><script>boot()</script>app")
	writeFile(t, filepath.Join(root, "assets", "app-1a2b.js"), "console")
	writeFile(t, filepath.Join(parent, "secret.txt"), "secret")
	assets := openWebAssets(t, root)
	base := "http" + strings.TrimPrefix(startRelay(t, func(config *relay.Config) {
		config.WebAssets = assets
	}), "ws")

	page, body := get(t, base+"/?window=chat")
	if page.StatusCode != http.StatusOK || !strings.HasSuffix(body, "app") {
		t.Fatalf("index: %d %q", page.StatusCode, body)
	}
	if page.Header.Get("Cache-Control") != "no-cache" {
		t.Fatalf("index cache %q", page.Header.Get("Cache-Control"))
	}
	policy := page.Header.Get("Content-Security-Policy")
	for _, directive := range []string{
		"script-src 'self' 'wasm-unsafe-eval' 'sha256-MeZS89WlF0u+o0hCvHTBt4q1WHU+U+sJKgbdRUc36mY='",
		"connect-src 'self'",
		"frame-ancestors 'none'",
	} {
		if !strings.Contains(policy, directive) {
			t.Fatalf("policy %q lacks %q", policy, directive)
		}
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
	if response, body := get(t, base+"/healthz"); response.StatusCode != http.StatusOK || !strings.Contains(body, `"ok":true`) {
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
