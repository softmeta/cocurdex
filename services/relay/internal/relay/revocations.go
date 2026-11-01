package relay

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

const revocationsFilename = "revocations.json"

var ErrCredentialRevoked = errors.New("the relay credential has been revoked")

type Revocation struct {
	Account   string    `json:"account"`
	RevokedAt time.Time `json:"revokedAt"`
	Reason    string    `json:"reason,omitempty"`
}

type revocationsFile struct {
	Version  int                   `json:"version"`
	Accounts map[string]Revocation `json:"accounts"`
}

type Revocations struct {
	mu       sync.Mutex
	path     string
	accounts map[string]Revocation
	file     os.FileInfo
}

func OpenRevocations(dataDir string) (*Revocations, error) {
	revocations := &Revocations{accounts: map[string]Revocation{}}
	if dataDir == "" {
		return revocations, nil
	}
	revocations.path = filepath.Join(dataDir, revocationsFilename)
	if _, err := revocations.Refresh(); err != nil {
		return nil, err
	}
	return revocations, nil
}

func (r *Revocations) Refresh() (bool, error) {
	if r.path == "" {
		return false, nil
	}
	info, err := os.Stat(r.path)
	r.mu.Lock()
	defer r.mu.Unlock()
	if errors.Is(err, os.ErrNotExist) {
		changed := len(r.accounts) > 0
		r.accounts, r.file = map[string]Revocation{}, nil
		return changed, nil
	}
	if err != nil {
		return false, fmt.Errorf("read revocations: %w", err)
	}
	if r.file != nil && os.SameFile(r.file, info) &&
		info.ModTime().Equal(r.file.ModTime()) && info.Size() == r.file.Size() {
		return false, nil
	}
	accounts, err := readRevocations(r.path)
	if err != nil {
		return false, err
	}
	r.accounts, r.file = accounts, info
	return true, nil
}

func (r *Revocations) Revoked(account string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	_, revoked := r.accounts[account]
	return revoked
}

func readRevocations(path string) (map[string]Revocation, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return map[string]Revocation{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read revocations: %w", err)
	}
	var stored revocationsFile
	if err := json.Unmarshal(raw, &stored); err != nil {
		return nil, fmt.Errorf("parse revocations: %w", err)
	}
	if stored.Accounts == nil {
		return map[string]Revocation{}, nil
	}
	return stored.Accounts, nil
}

func writeRevocations(path string, accounts map[string]Revocation) error {
	raw, err := json.MarshalIndent(revocationsFile{Version: 1, Accounts: accounts}, "", "  ")
	if err != nil {
		return err
	}
	if err := writeFileAtomic(path, append(raw, '\n')); err != nil {
		return fmt.Errorf("write revocations: %w", err)
	}
	return nil
}

func writeFileAtomic(path string, data []byte) error {
	temp, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".*")
	if err != nil {
		return err
	}
	defer os.Remove(temp.Name())
	if _, err := temp.Write(data); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Chmod(0o644); err != nil {
		temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	return os.Rename(temp.Name(), path)
}

func RevokeAccount(dataDir, account, reason string, now time.Time) error {
	if account == "" {
		return errors.New("an account is required")
	}
	path := filepath.Join(dataDir, revocationsFilename)
	accounts, err := readRevocations(path)
	if err != nil {
		return err
	}
	accounts[account] = Revocation{Account: account, RevokedAt: now.UTC(), Reason: reason}
	return writeRevocations(path, accounts)
}

func RestoreAccount(dataDir, account string) (bool, error) {
	path := filepath.Join(dataDir, revocationsFilename)
	accounts, err := readRevocations(path)
	if err != nil {
		return false, err
	}
	if _, ok := accounts[account]; !ok {
		return false, nil
	}
	delete(accounts, account)
	return true, writeRevocations(path, accounts)
}

func ListRevocations(dataDir string) ([]Revocation, error) {
	accounts, err := readRevocations(filepath.Join(dataDir, revocationsFilename))
	if err != nil {
		return nil, err
	}
	list := make([]Revocation, 0, len(accounts))
	for _, revocation := range accounts {
		list = append(list, revocation)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].RevokedAt.Before(list[j].RevokedAt) })
	return list, nil
}
