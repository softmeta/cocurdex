package relay

import (
	"sync"
	"time"
)

type bucket struct {
	tokens float64
	last   time.Time
}

type RateLimiter struct {
	mu      sync.Mutex
	rate    float64
	burst   float64
	buckets map[string]*bucket
	now     func() time.Time
}

func NewRateLimiter(perSecond float64, burst int, now func() time.Time) *RateLimiter {
	if now == nil {
		now = time.Now
	}
	return &RateLimiter{
		rate:    perSecond,
		burst:   float64(burst),
		buckets: map[string]*bucket{},
		now:     now,
	}
}

func (l *RateLimiter) Allow(key string) bool {
	if l == nil || l.rate <= 0 {
		return true
	}
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()
	current, ok := l.buckets[key]
	if !ok {
		current = &bucket{tokens: l.burst, last: now}
		l.buckets[key] = current
	}
	elapsed := now.Sub(current.last).Seconds()
	current.tokens = min(l.burst, current.tokens+elapsed*l.rate)
	current.last = now
	if current.tokens < 1 {
		return false
	}
	current.tokens--
	l.sweep(now)
	return true
}

func (l *RateLimiter) sweep(now time.Time) {
	if len(l.buckets) < 4096 {
		return
	}
	full := time.Duration(l.burst / l.rate * float64(time.Second))
	for key, entry := range l.buckets {
		if now.Sub(entry.last) > full {
			delete(l.buckets, key)
		}
	}
}
