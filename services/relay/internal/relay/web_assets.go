package relay

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path"
	"regexp"
	"strings"
)

const webAssetsImmutablePrefix = "assets/"

var inlineScriptPattern = regexp.MustCompile(`(?s)<script>(.*?)</script>`)

func parsedScriptText(raw []byte) []byte {
	text := bytes.ReplaceAll(raw, []byte("\r\n"), []byte("\n"))
	return bytes.ReplaceAll(text, []byte("\r"), []byte("\n"))
}

func contentSecurityPolicy(index []byte) string {
	scripts := []string{"'self'", "'wasm-unsafe-eval'"}
	for _, match := range inlineScriptPattern.FindAllSubmatch(index, -1) {
		digest := sha256.Sum256(parsedScriptText(match[1]))
		scripts = append(scripts, "'sha256-"+base64.StdEncoding.EncodeToString(digest[:])+"'")
	}
	return strings.Join([]string{
		"default-src 'self'",
		"script-src " + strings.Join(scripts, " "),
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob: https:",
		"media-src 'self' data: blob:",
		"font-src 'self' data:",
		"connect-src 'self'",
		"worker-src 'self' blob:",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'none'",
		"frame-ancestors 'none'",
	}, "; ")
}

type WebAssets struct {
	root    *os.Root
	handler http.Handler
}

func (a *WebAssets) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	a.handler.ServeHTTP(w, r)
}

func (a *WebAssets) Close() error {
	return a.root.Close()
}

func NewWebAssets(dir string) (*WebAssets, error) {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, fmt.Errorf("open web root: %w", err)
	}
	files := root.FS()
	index, err := fs.ReadFile(files, "index.html")
	if err != nil {
		root.Close()
		return nil, fmt.Errorf("web root has no index.html: %w", err)
	}
	policy := contentSecurityPolicy(index)
	fileServer := http.FileServerFS(files)
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if name != "" {
			info, err := fs.Stat(files, name)
			if err != nil || info.IsDir() {
				http.NotFound(w, r)
				return
			}
		}
		header := w.Header()
		if strings.HasPrefix(name, webAssetsImmutablePrefix) {
			header.Set("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			header.Set("Cache-Control", "no-cache")
		}
		header.Set("Content-Security-Policy", policy)
		header.Set("X-Content-Type-Options", "nosniff")
		header.Set("Referrer-Policy", "no-referrer")
		fileServer.ServeHTTP(w, r)
	})
	return &WebAssets{root: root, handler: handler}, nil
}
