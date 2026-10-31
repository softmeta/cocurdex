package relay

import (
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

const bindingsFilename = "route-bindings.json"

var ErrRouteTaken = errors.New("route id is bound to another signing key")

type Bindings struct {
	mu   sync.Mutex
	path string
	keys map[string]string
}

type bindingsFile struct {
	Version int               `json:"version"`
	Routes  map[string]string `json:"routes"`
}

func OpenBindings(dataDir string) (*Bindings, error) {
	bindings := &Bindings{keys: map[string]string{}}
	if dataDir == "" {
		return bindings, nil
	}
	if err := os.MkdirAll(dataDir, 0o700); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}
	bindings.path = filepath.Join(dataDir, bindingsFilename)
	raw, err := os.ReadFile(bindings.path)
	if errors.Is(err, os.ErrNotExist) {
		return bindings, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read route bindings: %w", err)
	}
	var stored bindingsFile
	if err := json.Unmarshal(raw, &stored); err != nil {
		return nil, fmt.Errorf("parse route bindings: %w", err)
	}
	if stored.Routes != nil {
		bindings.keys = stored.Routes
	}
	return bindings, nil
}

func (b *Bindings) Claim(routeID string, signingKey ed25519.PublicKey) error {
	encoded := EncodeBase64URL(signingKey)
	b.mu.Lock()
	defer b.mu.Unlock()
	if existing, ok := b.keys[routeID]; ok {
		if existing == encoded {
			return nil
		}
		return ErrRouteTaken
	}
	b.keys[routeID] = encoded
	if err := b.persist(); err != nil {
		delete(b.keys, routeID)
		return err
	}
	return nil
}

func (b *Bindings) persist() error {
	if b.path == "" {
		return nil
	}
	raw, err := json.Marshal(bindingsFile{Version: 1, Routes: b.keys})
	if err != nil {
		return err
	}
	temp, err := os.CreateTemp(filepath.Dir(b.path), bindingsFilename+".*")
	if err != nil {
		return fmt.Errorf("write route bindings: %w", err)
	}
	if _, err := temp.Write(raw); err != nil {
		temp.Close()
		os.Remove(temp.Name())
		return fmt.Errorf("write route bindings: %w", err)
	}
	if err := temp.Close(); err != nil {
		os.Remove(temp.Name())
		return fmt.Errorf("write route bindings: %w", err)
	}
	if err := os.Rename(temp.Name(), b.path); err != nil {
		os.Remove(temp.Name())
		return fmt.Errorf("write route bindings: %w", err)
	}
	return nil
}
