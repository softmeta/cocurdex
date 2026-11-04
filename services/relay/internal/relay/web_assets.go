package relay

import (
	"bytes"
	"cmp"
	"compress/gzip"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"
)

func contentType(name string) string {
	if kind := compressibleTypes[path.Ext(name)]; kind != "" {
		return kind
	}
	if kind := mime.TypeByExtension(path.Ext(name)); kind != "" {
		return kind
	}
	return "application/octet-stream"
}

const (
	webAssetsImmutablePrefix = "assets/"
	minCompressibleBytes     = 1024
)

var compressibleTypes = map[string]string{
	".css":  "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js":   "text/javascript; charset=utf-8",
	".json": "application/json",
	".mjs":  "text/javascript; charset=utf-8",
	".pfb":  "application/octet-stream",
	".svg":  "image/svg+xml",
	".ttf":  "font/ttf",
	".txt":  "text/plain; charset=utf-8",
	".wasm": "application/wasm",
}

type compressedFile struct {
	gzip     []byte
	modified time.Time
}

func compressWebFiles(files fs.FS) (map[string]compressedFile, error) {
	compressed := map[string]compressedFile{}
	err := fs.WalkDir(files, ".", func(name string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() || compressibleTypes[path.Ext(name)] == "" {
			return err
		}
		info, err := entry.Info()
		if err != nil || info.Size() < minCompressibleBytes {
			return err
		}
		raw, err := fs.ReadFile(files, name)
		if err != nil {
			return err
		}
		var packed bytes.Buffer
		writer, _ := gzip.NewWriterLevel(&packed, gzip.BestCompression)
		if _, err := writer.Write(raw); err != nil {
			return err
		}
		if err := writer.Close(); err != nil {
			return err
		}
		if packed.Len()*10 < len(raw)*9 {
			compressed[name] = compressedFile{gzip: packed.Bytes(), modified: info.ModTime()}
		}
		return nil
	})
	return compressed, err
}

func acceptsGzip(header string) bool {
	for _, part := range strings.Split(header, ",") {
		coding, params, _ := strings.Cut(part, ";")
		coding = strings.ToLower(strings.TrimSpace(coding))
		if coding != "gzip" && coding != "*" {
			continue
		}
		quality := strings.ReplaceAll(strings.TrimSpace(params), " ", "")
		if quality == "" || !strings.HasPrefix(quality, "q=0") {
			return true
		}
		value, err := strconv.ParseFloat(strings.TrimPrefix(quality, "q="), 64)
		return err == nil && value > 0
	}
	return false
}

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
		"connect-src 'self' wss:",
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
	compressed, err := compressWebFiles(files)
	if err != nil {
		root.Close()
		return nil, fmt.Errorf("compress web root: %w", err)
	}
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
		file, ok := compressed[cmp.Or(name, "index.html")]
		if !ok {
			fileServer.ServeHTTP(w, r)
			return
		}
		header.Add("Vary", "Accept-Encoding")
		if !acceptsGzip(r.Header.Get("Accept-Encoding")) {
			fileServer.ServeHTTP(w, r)
			return
		}
		header.Set("Content-Encoding", "gzip")
		header.Set("Content-Type", contentType(cmp.Or(name, "index.html")))
		http.ServeContent(w, r, name, file.modified, bytes.NewReader(file.gzip))
	})
	return &WebAssets{root: root, handler: handler}, nil
}
