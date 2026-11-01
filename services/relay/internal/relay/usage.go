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

const (
	usageFilename  = "usage.json"
	usageDayLayout = "2006-01-02"
	usageRetention = 90
)

type UsageDay struct {
	Bytes    int64     `json:"bytes"`
	Sessions int64     `json:"sessions"`
	LastSeen time.Time `json:"lastSeen"`
}

type usageFile struct {
	Version  int                            `json:"version"`
	Accounts map[string]map[string]UsageDay `json:"accounts"`
}

type Usage struct {
	mu       sync.Mutex
	path     string
	accounts map[string]map[string]UsageDay
	dirty    bool
}

func OpenUsage(dataDir string) (*Usage, error) {
	usage := &Usage{accounts: map[string]map[string]UsageDay{}}
	if dataDir == "" {
		return usage, nil
	}
	usage.path = filepath.Join(dataDir, usageFilename)
	accounts, err := readUsage(usage.path)
	if err != nil {
		return nil, err
	}
	usage.accounts = accounts
	return usage, nil
}

func (u *Usage) update(account string, now time.Time, change func(*UsageDay)) {
	if account == "" {
		return
	}
	day := now.UTC().Format(usageDayLayout)
	u.mu.Lock()
	defer u.mu.Unlock()
	days := u.accounts[account]
	if days == nil {
		days = map[string]UsageDay{}
		u.accounts[account] = days
	}
	entry := days[day]
	change(&entry)
	entry.LastSeen = now.UTC()
	days[day] = entry
	u.dirty = true
}

func (u *Usage) AddSession(account string, now time.Time) {
	u.update(account, now, func(day *UsageDay) { day.Sessions++ })
}

func (u *Usage) AddBytes(account string, bytes int, now time.Time) {
	u.update(account, now, func(day *UsageDay) { day.Bytes += int64(bytes) })
}

func (u *Usage) Flush(now time.Time) error {
	if u.path == "" {
		return nil
	}
	u.mu.Lock()
	if !u.dirty {
		u.mu.Unlock()
		return nil
	}
	oldest := now.UTC().AddDate(0, 0, -usageRetention).Format(usageDayLayout)
	snapshot := make(map[string]map[string]UsageDay, len(u.accounts))
	for account, days := range u.accounts {
		for day := range days {
			if day < oldest {
				delete(days, day)
			}
		}
		if len(days) == 0 {
			delete(u.accounts, account)
			continue
		}
		copied := make(map[string]UsageDay, len(days))
		for day, entry := range days {
			copied[day] = entry
		}
		snapshot[account] = copied
	}
	u.dirty = false
	u.mu.Unlock()
	raw, err := json.MarshalIndent(usageFile{Version: 1, Accounts: snapshot}, "", "  ")
	if err != nil {
		return err
	}
	if err := writeFileAtomic(u.path, append(raw, '\n')); err != nil {
		u.mu.Lock()
		u.dirty = true
		u.mu.Unlock()
		return fmt.Errorf("write usage: %w", err)
	}
	return nil
}

func readUsage(path string) (map[string]map[string]UsageDay, error) {
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return map[string]map[string]UsageDay{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read usage: %w", err)
	}
	var stored usageFile
	if err := json.Unmarshal(raw, &stored); err != nil {
		return nil, fmt.Errorf("parse usage: %w", err)
	}
	if stored.Accounts == nil {
		return map[string]map[string]UsageDay{}, nil
	}
	return stored.Accounts, nil
}

type AccountUsage struct {
	Account  string    `json:"account"`
	Bytes    int64     `json:"bytes"`
	Sessions int64     `json:"sessions"`
	LastSeen time.Time `json:"lastSeen"`
	Revoked  bool      `json:"revoked"`
}

func SummarizeUsage(dataDir string, days int, now time.Time) ([]AccountUsage, error) {
	accounts, err := readUsage(filepath.Join(dataDir, usageFilename))
	if err != nil {
		return nil, err
	}
	revoked, err := readRevocations(filepath.Join(dataDir, revocationsFilename))
	if err != nil {
		return nil, err
	}
	since := now.UTC().AddDate(0, 0, 1-days).Format(usageDayLayout)
	summary := make([]AccountUsage, 0, len(accounts))
	for account, perDay := range accounts {
		total := AccountUsage{Account: account}
		for day, entry := range perDay {
			if day < since {
				continue
			}
			total.Bytes += entry.Bytes
			total.Sessions += entry.Sessions
			if entry.LastSeen.After(total.LastSeen) {
				total.LastSeen = entry.LastSeen
			}
		}
		if total.Sessions == 0 && total.Bytes == 0 {
			continue
		}
		_, total.Revoked = revoked[account]
		summary = append(summary, total)
	}
	sort.Slice(summary, func(i, j int) bool {
		if summary[i].Bytes != summary[j].Bytes {
			return summary[i].Bytes > summary[j].Bytes
		}
		return summary[i].Account < summary[j].Account
	})
	return summary, nil
}
