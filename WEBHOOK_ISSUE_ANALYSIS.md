# Webhook Issue Analysis - Anchor Team Meeting Findings

## Critical Issues Identified

Based on the Anchor documentation provided and analysis of our codebase, I've identified the following issues:

---

## Issue #1: Response Order - Not Acknowledging Before Processing ❌

### Problem
**Our code returns 401 BEFORE acknowledging the webhook**, which causes Anchor to see a failure and retry.

### Current Flow (WRONG):
```
1. Receive webhook POST
2. Read body
3. Validate signature → FAILS → Return 401 immediately ❌
4. (Never reaches 200 response)
```

### What Should Happen (CORRECT):
```
1. Receive webhook POST
2. Return 200 immediately ✅
3. Then validate signature (async/background)
4. Process event (async/background)
```

### Evidence
- **Line 113-117 in handlers.go**: We validate signature and return 401 if invalid
- **Line 183-184**: We only return 200 AFTER all processing is complete
- **webhook.site**: Returns 200 immediately (as seen in the logs)
- **Our webhook**: Returns 401 on first attempt, causing Anchor to retry

### Code Location
```go
// Line 113-117
if !h.isValidSignature(r.Header.Get("x-anchor-signature"), body, timestamp) {
    log.Printf("[%s] Error: Invalid webhook signature", requestID)
    http.Error(w, "Invalid signature", http.StatusUnauthorized)  // ❌ Returns 401 immediately
    return
}
// ... processing happens here ...
// Line 183-184: Only returns 200 if we get here
w.WriteHeader(http.StatusOK)
w.Write([]byte("Webhook received"))
```

---

## Issue #2: Signature Calculation Mismatch ❌

### Anchor Documentation Says:
1. **Algorithm**: HMAC-SHA1 ONLY (not SHA256)
2. **Payload**: Raw request body bytes (no timestamp)
3. **Signature Format**: `Base64(HMAC_SHA1(requestbody, key="webhook token"))`
4. **Python Example Shows**:
   ```python
   hmac_digest = hmac.new(secret_to_bytes, payload, hashlib.sha1).hexdigest()
   encode_decode = base64.b64encode(hmac_digest.encode()).decode()
   ```
   This means: `HMAC-SHA1 → hex string → bytes → base64 → string`

### What Our Code Does:
1. **Tries BOTH SHA1 and SHA256** (line 643-655) - Anchor only uses SHA1
2. **Tries timestamp-based payload FIRST** (line 244-250) - Anchor docs don't mention timestamp
3. **Tries multiple encoding variants** (line 658-686) - This is fine, but we're not prioritizing the correct one
4. **Our correct variant exists** (line 665: `base64HexLower`) but it's mixed with wrong variants

### Code Issues:

#### Problem 1: Using SHA256
```go
// Line 648-650: We calculate SHA256
sha256Mac := hmac.New(sha256.New, []byte(secret))
sha256Mac.Write(payload)
sha256Raw := sha256Mac.Sum(nil)
```
**Anchor docs say**: HMAC-SHA1 ONLY. We shouldn't be using SHA256.

#### Problem 2: Using Timestamp in Payload
```go
// Line 244-250: We try timestamp-based payload
if trimmedTimestamp != "" {
    var builder strings.Builder
    builder.WriteString(trimmedTimestamp)
    builder.WriteByte('.')
    builder.Write(body)
    attempts = append(attempts, payloadAttempt{name: "timestamp", payload: []byte(builder.String())})
}
```
**Anchor docs say**: Signature is calculated from raw request body only. No timestamp mentioned.

#### Problem 3: Multiple Encoding Variants
We try:
- Base64 of raw bytes (line 661)
- Base64 of hex string (line 665) ← This is the correct one according to Anchor docs
- But we also try SHA256 variants

### The Correct Calculation According to Anchor:
```python
# Python (from Anchor docs):
hmac_digest = hmac.new(secret_to_bytes, payload, hashlib.sha1).hexdigest()
encode_decode = base64.b64encode(hmac_digest.encode()).decode()
```

**Step-by-step**:
1. `hmac.new(secret_to_bytes, payload, hashlib.sha1)` → HMAC object
2. `.hexdigest()` → hex string (e.g., "abc123def456...")
3. `.encode()` → convert hex string to bytes (e.g., b"abc123...")
4. `base64.b64encode(...)` → base64 encode those bytes
5. `.decode()` → convert back to string

**In Go, this should be**:
```go
// 1. HMAC-SHA1 of raw body bytes
hmacDigest := hmac.New(sha1.New, []byte(secret))
hmacDigest.Write(body)  // raw body bytes, NO timestamp
rawBytes := hmacDigest.Sum(nil)

// 2. Convert to hex string
hexString := hex.EncodeToString(rawBytes)  // "abc123..."

// 3. Convert hex string to bytes
hexBytes := []byte(hexString)  // []byte("abc123...")

// 4. Base64 encode
signature := base64.StdEncoding.EncodeToString(hexBytes)
```

**Our code analysis**:
- ✅ **Line 665**: `base64HexLower := base64.StdEncoding.EncodeToString([]byte(hexLower))` - This is CORRECT!
- ❌ **Line 661**: `base64Std := base64.StdEncoding.EncodeToString(raw)` - This is Base64 of raw bytes directly (WRONG)
- ❌ **Line 648-650**: We calculate SHA256 (WRONG - Anchor only uses SHA1)
- ❌ **Line 244-250**: We try timestamp-based payload first (WRONG - Anchor uses raw body only)

**So we HAVE the correct calculation**, but:
- We're not prioritizing it (it's mixed with wrong variants)
- We're also trying wrong algorithms (SHA256)
- We're trying wrong payload formats (timestamp-based)
- We're checking signature BEFORE acknowledging

---

## Issue #3: Processing Before Acknowledgment ❌

### Problem
Even if signature validation passes, we process the event (lines 171-179) BEFORE sending the 200 response (lines 183-184). If processing takes time or fails, Anchor might timeout.

### Current Flow:
```
1. Validate signature ✅
2. Parse JSON ✅
3. Check duplicates ✅
4. Process event (can take time, can fail) ⏳
5. THEN return 200 ❌
```

### What Should Happen:
```
1. Return 200 immediately ✅
2. Process in background (async)
```

---

## Summary of Issues

| Issue | Severity | Impact | Location |
|-------|----------|--------|----------|
| **1. Returns 401 before acknowledging** | 🔴 CRITICAL | Anchor sees failure, retries. First attempt always fails. | Line 113-117 |
| **2. Uses SHA256** | 🟡 MEDIUM | Tries wrong algorithm, might match by accident | Line 648-650 |
| **3. Uses timestamp in payload** | 🟡 MEDIUM | Tries wrong payload format first | Line 244-250 |
| **4. Processes before 200 response** | 🟡 MEDIUM | Risk of timeout if processing is slow | Line 171-184 |

---

## Why webhook.site Works (200 Response)

**webhook.site**:
1. Receives POST request
2. **Returns 200 immediately** ✅
3. Stores/logs the request
4. No signature validation (it's just a testing tool)

**Our webhook**:
1. Receives POST request
2. Validates signature → **Returns 401 if invalid** ❌
3. Anchor sees 401, marks as failed, retries
4. On retry, signature might match (due to timing or other factors)

---

## The Root Cause

The primary issue is **Issue #1**: We're not acknowledging the webhook before validating/processing. This causes Anchor to see a 401 response and retry the webhook.

The secondary issues are related to signature calculation:
- We're trying wrong algorithms (SHA256)
- We're trying wrong payload formats (timestamp-based)
- The correct calculation exists but is buried among wrong variants

---

## Recommended Fixes (NOT IMPLEMENTED - AWAITING CONFIRMATION)

### Fix #1: Acknowledge Before Processing
```go
// At the START of ServeHTTP, after reading body:
w.WriteHeader(http.StatusOK)
w.Write([]byte("Webhook received"))

// Then validate and process in background
go func() {
    // Validate signature
    // Process event
}()
```

### Fix #2: Use Correct Signature Calculation
1. **Remove SHA256** - Anchor only uses SHA1
2. **Remove timestamp-based payload** - Anchor uses raw body only
3. **Prioritize correct encoding**: HMAC-SHA1 → hex → bytes → base64

### Fix #3: Process Asynchronously
After acknowledging with 200, process the event asynchronously to avoid timeouts.

---

## Questions to Verify with Anchor

1. **Response timing**: Should we return 200 immediately, or after signature validation?
2. **Signature payload**: Is it raw body bytes only, or does it include timestamp?
3. **Algorithm**: Is it HMAC-SHA1 only, or do they also use SHA256?
4. **Encoding**: Is it `Base64(bytes(hex(HMAC-SHA1(body))))` or direct `Base64(HMAC-SHA1(body))`?

---

## Next Steps

1. ✅ **Identified the issues** (this document)
2. ⏳ **Await confirmation** before implementing fixes
3. ⏳ **Implement fixes** after confirmation
4. ⏳ **Test with Anchor** to verify

