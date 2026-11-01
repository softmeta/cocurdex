package relay

import (
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path"
	"strings"
)

const webAssetsImmutablePrefix = "assets/"

func NewWebAssets(dir string) (http.Handler, error) {
	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, fmt.Errorf("open web root: %w", err)
	}
	files := root.FS()
	if _, err := fs.Stat(files, "index.html"); err != nil {
		return nil, fmt.Errorf("web root has no index.html: %w", err)
	}
	fileServer := http.FileServerFS(files)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
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
		header.Set("X-Content-Type-Options", "nosniff")
		header.Set("Referrer-Policy", "no-referrer")
		fileServer.ServeHTTP(w, r)
	}), nil
}
