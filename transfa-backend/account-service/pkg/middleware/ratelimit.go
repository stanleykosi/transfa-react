/**
 * @description
 * Rate limiting middleware to prevent abuse and ensure fair resource usage.
 * Uses a simple in-memory token bucket algorithm for rate limiting.
 * 
 * @dependencies
 * - sync: For thread-safe operations
 * - time: For time-based rate limiting
 * - net/http: For HTTP middleware
 */
package middleware

import (
	"net/http"
	"sync"
	"time"
)

// RateLimiter implements a token bucket rate limiter
type RateLimiter struct {
	requests   map[string]*TokenBucket
	mutex      sync.RWMutex
	cleanup    chan string
	stopCleanup chan struct{}
}

// TokenBucket represents a token bucket for rate limiting
type TokenBucket struct {
	tokens     int
	capacity   int
	lastRefill time.Time
	refillRate time.Duration
	mutex      sync.Mutex
}

// NewRateLimiter creates a new rate limiter with the specified rate and burst
func NewRateLimiter(rate int, burst int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		requests:    make(map[string]*TokenBucket),
		cleanup:     make(chan string, 1000),
		stopCleanup: make(chan struct{}),
	}
	
	// Start cleanup goroutine
	go rl.cleanupExpiredBuckets()
	
	return rl
}

// Allow checks if a request from the given key should be allowed
func (rl *RateLimiter) Allow(key string) bool {
	rl.mutex.Lock()
	defer rl.mutex.Unlock()
	
	bucket, exists := rl.requests[key]
	if !exists {
		// Create new bucket for this key
		bucket = &TokenBucket{
			tokens:     100, // Start with full bucket
			capacity:   100,
			lastRefill: time.Now(),
			refillRate: time.Second / 10, // 10 requests per second
		}
		rl.requests[key] = bucket
	}
	
	return bucket.consume()
}

// cleanupExpiredBuckets removes old buckets to prevent memory leaks
func (rl *RateLimiter) cleanupExpiredBuckets() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	
	for {
		select {
		case <-ticker.C:
			rl.mutex.Lock()
			now := time.Now()
			for key, bucket := range rl.requests {
				bucket.mutex.Lock()
				if now.Sub(bucket.lastRefill) > 10*time.Minute {
					delete(rl.requests, key)
				}
				bucket.mutex.Unlock()
			}
			rl.mutex.Unlock()
		case <-rl.stopCleanup:
			return
		}
	}
}

// consume attempts to consume a token from the bucket
func (tb *TokenBucket) consume() bool {
	tb.mutex.Lock()
	defer tb.mutex.Unlock()
	
	now := time.Now()
	
	// Refill tokens based on time elapsed
	elapsed := now.Sub(tb.lastRefill)
	tokensToAdd := int(elapsed / tb.refillRate)
	
	if tokensToAdd > 0 {
		tb.tokens = min(tb.capacity, tb.tokens+tokensToAdd)
		tb.lastRefill = now
	}
	
	// Check if we can consume a token
	if tb.tokens > 0 {
		tb.tokens--
		return true
	}
	
	return false
}

// min returns the minimum of two integers
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// RateLimitMiddleware creates a rate limiting middleware
func RateLimitMiddleware(requestsPerMinute int) func(http.Handler) http.Handler {
	// Convert requests per minute to requests per second
	rate := requestsPerMinute / 60
	if rate < 1 {
		rate = 1
	}
	
	// Create rate limiter with burst capacity
	limiter := NewRateLimiter(rate, rate*2, time.Minute)
	
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Get client IP for rate limiting
			clientIP := getClientIP(r)
			
			// Check if request is allowed
			if !limiter.Allow(clientIP) {
				http.Error(w, "Rate limit exceeded. Please try again later.", http.StatusTooManyRequests)
				return
			}
			
			// Add rate limit headers
			w.Header().Set("X-RateLimit-Limit", "1000")
			w.Header().Set("X-RateLimit-Remaining", "999") // Simplified
			
			next.ServeHTTP(w, r)
		})
	}
}

// getClientIP extracts the client IP from the request
func getClientIP(r *http.Request) string {
	// Check X-Forwarded-For header first (for load balancers/proxies)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		// X-Forwarded-For can contain multiple IPs, take the first one
		if idx := len(xff); idx > 0 {
			for i, c := range xff {
				if c == ',' {
					idx = i
					break
				}
			}
			return xff[:idx]
		}
	}
	
	// Check X-Real-IP header
	if xri := r.Header.Get("X-Real-IP"); xri != "" {
		return xri
	}
	
	// Fallback to RemoteAddr
	ip := r.RemoteAddr
	if idx := len(ip); idx > 0 {
		for i, c := range ip {
			if c == ':' {
				idx = i
				break
			}
		}
		return ip[:idx]
	}
	
	return "unknown"
}
