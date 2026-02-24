package app

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

var moneyDropRateLimitScript = redis.NewScript(`
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  ttl = tonumber(ARGV[1])
end
return {current, ttl}
`)

// RedisMoneyDropRateLimiter implements distributed rate limiting using Redis.
type RedisMoneyDropRateLimiter struct {
	client redis.UniversalClient
	prefix string
}

func NewRedisMoneyDropRateLimiter(client redis.UniversalClient, prefix string) *RedisMoneyDropRateLimiter {
	trimmedPrefix := strings.TrimSpace(prefix)
	if trimmedPrefix == "" {
		trimmedPrefix = "transfa:rate_limit"
	}
	trimmedPrefix = strings.TrimSuffix(trimmedPrefix, ":")

	return &RedisMoneyDropRateLimiter{
		client: client,
		prefix: trimmedPrefix,
	}
}

func (r *RedisMoneyDropRateLimiter) ConsumeRateLimit(
	ctx context.Context,
	scope string,
	subject string,
	limit int,
	window time.Duration,
) (count int, retryAfterSeconds int, err error) {
	if r == nil || r.client == nil || limit <= 0 || window <= 0 {
		return 0, 0, nil
	}

	normalizedScope := strings.TrimSpace(scope)
	normalizedSubject := strings.TrimSpace(subject)
	if normalizedScope == "" || normalizedSubject == "" {
		return 0, 0, nil
	}

	windowMs := window.Milliseconds()
	if windowMs < 1000 {
		windowMs = 1000
	}

	key := fmt.Sprintf("%s:%s:%s", r.prefix, normalizedScope, normalizedSubject)
	rawResult, err := moneyDropRateLimitScript.Run(ctx, r.client, []string{key}, windowMs).Result()
	if err != nil {
		return 0, 0, err
	}

	values, ok := rawResult.([]interface{})
	if !ok || len(values) != 2 {
		return 0, 0, fmt.Errorf("unexpected redis limiter response shape: %T", rawResult)
	}

	currentCount, ok := values[0].(int64)
	if !ok {
		return 0, 0, fmt.Errorf("unexpected redis limiter count type: %T", values[0])
	}

	ttlMs, ok := values[1].(int64)
	if !ok {
		return int(currentCount), 0, fmt.Errorf("unexpected redis limiter ttl type: %T", values[1])
	}
	if ttlMs < 0 {
		ttlMs = windowMs
	}

	retryAfter := int(math.Ceil(float64(ttlMs) / 1000.0))
	if retryAfter < 1 {
		retryAfter = 1
	}

	return int(currentCount), retryAfter, nil
}
