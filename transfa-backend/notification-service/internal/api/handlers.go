/**
 * @description
 * This file contains the HTTP handler for processing incoming webhooks from Anchor.
 * It acts as the primary entry point for all real-time notifications from the BaaS provider.
 *
 * Key features:
 * - Security: Validates the HMAC signature of incoming webhooks to ensure authenticity.
 * - Parsing: Decodes the JSON payload into strongly-typed Go structs.
 * - Routing: Inspects the event type to decide what action to take.
 * - Event Publishing: Publishes new, internal events to a RabbitMQ exchange for
 *   decoupled processing by other microservices.
 *
 * @dependencies
 * - crypto/hmac, crypto/sha1, encoding/base64: For webhook signature validation.
 * - encoding/json: For handling JSON data.
 * - net/http: For standard HTTP server functionality.
 * - The service's internal packages for domain models and RabbitMQ integration.
 */
package api

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/transfa/notification-service/internal/domain"
	"github.com/transfa/notification-service/pkg/rabbitmq"
)

// WebhookHandler processes incoming webhooks from Anchor.
type WebhookHandler struct {
	producer        *rabbitmq.EventProducer
	secret          string
	processedEvents map[string]time.Time
	mutex           sync.RWMutex
}

func extractReason(attrs map[string]interface{}) string {
	if attrs == nil {
		return ""
	}
	if v, ok := attrs["message"].(string); ok {
		return v
	}
	if detail, ok := attrs["detail"].(string); ok {
		return detail
	}
	return ""
}

// NewWebhookHandler creates a new handler for the webhook endpoint.
func NewWebhookHandler(producer *rabbitmq.EventProducer, secret string) *WebhookHandler {
	return &WebhookHandler{
		producer:        producer,
		secret:          secret,
		processedEvents: make(map[string]time.Time),
	}
}

// ServeHTTP implements the http.Handler interface.
func (h *WebhookHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	startTime := time.Now()
	requestID := r.Header.Get("X-Request-ID")
	if requestID == "" {
		requestID = fmt.Sprintf("req_%d", time.Now().UnixNano())
	}
	
	log.Printf("[%s] Webhook request started from %s", requestID, r.RemoteAddr)
	
	// 1. Read the request body. We need to read it once for signature validation
	// and then again for decoding, so we buffer it.
	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("[%s] Error reading webhook body: %v", requestID, err)
		http.Error(w, "Cannot read request body", http.StatusBadRequest)
		return
	}
	log.Printf("[%s] Raw webhook body: %s", requestID, string(body))
	// Restore the body for subsequent reads.
	r.Body = io.NopCloser(bytes.NewBuffer(body))

	// 2. Validate the signature for security.
	if !h.isValidSignature(r.Header.Get("x-anchor-signature"), body) {
		log.Printf("[%s] Error: Invalid webhook signature", requestID)
		http.Error(w, "Invalid signature", http.StatusUnauthorized)
		return
	}

	// 3. Decode the webhook payload.
	var event domain.AnchorWebhookEvent
	if err := json.Unmarshal(body, &event); err != nil {
		log.Printf("[%s] Error decoding webhook JSON: %v", requestID, err)
		var fallback map[string]any
		if err := json.Unmarshal(body, &fallback); err == nil {
			if evt, ok := fallback["event"].(string); ok {
				event.Event = evt
			}
		}
		if event.Event == "" {
			http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
			return
		}
	}
	if event.Event == "" {
		var raw map[string]interface{}
		if err := json.Unmarshal(body, &raw); err == nil {
			if evt, ok := raw["eventName"].(string); ok && evt != "" {
				event.Event = evt
			} else if evt, ok := raw["eventType"].(string); ok && evt != "" {
				event.Event = evt
			} else if evt, ok := raw["event"].(string); ok && evt != "" {
				event.Event = evt
			}
		}
		if event.Event == "" && event.Data.Type != "" {
			event.Event = event.Data.Type
		}
		if event.Event == "" {
			log.Printf("[%s] Webhook missing event field. Raw payload: %s", requestID, string(body))
		}
	}

	anchorCustomerID := event.Data.ID
	if id := extractAnchorCustomerID(event); id != "" {
		anchorCustomerID = id
	}

	log.Printf("[%s] Received webhook event: %s for resource ID: %s (anchor customer: %s)", requestID, event.Event, event.Data.ID, anchorCustomerID)

	// 4. Check for duplicate events to prevent reprocessing
	if h.isDuplicateEvent(event.Data.ID, event.Event) {
		log.Printf("[%s] Duplicate event detected and ignored: %s for resource ID: %s", requestID, event.Event, event.Data.ID)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Duplicate event ignored"))
		return
	}

	// 5. Process the event based on its type.
	ctx := r.Context()

	if handler, ok := h.routeEvent(ctx, event, anchorCustomerID); ok {
		if err := handler(); err != nil {
			log.Printf("[%s] Failed to process event %s: %v", requestID, event.Event, err)
			http.Error(w, "Internal server error during event processing", http.StatusInternalServerError)
			return
		}
	} else {
		log.Printf("[%s] Unhandled webhook event type: %s", requestID, event.Event)
	}

	log.Printf("[%s] Webhook processed successfully in %v", requestID, time.Since(startTime))
	
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Webhook received"))
}

func nullableString(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}

func extractAnchorCustomerID(event domain.AnchorWebhookEvent) string {
	if rel, ok := event.Data.Relationships["customer"]; ok {
		if len(rel.Data) > 0 {
			var single domain.RelationshipData
			if err := json.Unmarshal(rel.Data, &single); err == nil && single.ID != "" {
				return single.ID
			}
			var list []domain.RelationshipData
			if err := json.Unmarshal(rel.Data, &list); err == nil {
				for _, item := range list {
					if item.ID != "" {
						return item.ID
					}
				}
			}
		}
	}
	for _, included := range event.Included {
		lowerType := strings.ToLower(included.Type)
		if strings.Contains(lowerType, "customer") && included.ID != "" {
			return included.ID
		}
	}
	return ""
}

// isValidSignature validates the HMAC signature of the webhook with improved robustness.
// This function handles multiple signature formats that Anchor might send.
func (h *WebhookHandler) isValidSignature(signatureHeader string, body []byte) bool {
	if h.secret == "" {
		log.Println("Warning: ANCHOR_WEBHOOK_SECRET is not set. Skipping signature validation.")
		return true
	}


	header := strings.TrimSpace(signatureHeader)
	if header == "" {
		log.Println("Missing x-anchor-signature header")
		return false
	}

	// Calculate expected signatures
	sha1Mac := hmac.New(sha1.New, []byte(h.secret))
	sha1Mac.Write(body)
	sha1Expected := sha1Mac.Sum(nil)
	sha1Base64 := base64.StdEncoding.EncodeToString(sha1Expected)

	sha256Mac := hmac.New(sha256.New, []byte(h.secret))
	sha256Mac.Write(body)
	sha256Expected := sha256Mac.Sum(nil)
	sha256Base64 := base64.StdEncoding.EncodeToString(sha256Expected)
	sha256Hex := hex.EncodeToString(sha256Expected)

	// Try different secret variations in case of encoding issues
	secretVariations := []string{
		h.secret,
		strings.TrimSpace(h.secret),
		strings.Trim(h.secret, "\"'"),
	}
	
	// If secret looks like it might be base64 encoded, try decoding it
	if decoded, err := base64.StdEncoding.DecodeString(h.secret); err == nil {
		secretVariations = append(secretVariations, string(decoded))
	}

	log.Printf("Debug signature check: provided=%s | expected sha1=%s | expected sha256=%s", header, sha1Base64, sha256Hex)

	// 1. Try direct string comparison first (most common cases)
	if header == sha1Base64 {
		log.Println("Signature matched sha1 base64 (primary)")
		return true
	}
	if header == sha256Hex {
		log.Println("Signature matched sha256 hex (primary)")
		return true
	}
	if header == sha256Base64 {
		log.Println("Signature matched sha256 base64 (primary)")
		return true
	}

	// 1.5. Try with different secret variations
	for i, secret := range secretVariations {
		if secret == h.secret {
			continue // Already tried above
		}
		
		// Calculate signatures with this secret variation
		sha1MacVar := hmac.New(sha1.New, []byte(secret))
		sha1MacVar.Write(body)
		sha1ExpectedVar := sha1MacVar.Sum(nil)
		sha1Base64Var := base64.StdEncoding.EncodeToString(sha1ExpectedVar)

		sha256MacVar := hmac.New(sha256.New, []byte(secret))
		sha256MacVar.Write(body)
		sha256ExpectedVar := sha256MacVar.Sum(nil)
		sha256Base64Var := base64.StdEncoding.EncodeToString(sha256ExpectedVar)
		sha256HexVar := hex.EncodeToString(sha256ExpectedVar)

		if header == sha1Base64Var {
			log.Printf("Signature matched sha1 base64 with secret variation %d", i)
			return true
		}
		if header == sha256HexVar {
			log.Printf("Signature matched sha256 hex with secret variation %d", i)
			return true
		}
		if header == sha256Base64Var {
			log.Printf("Signature matched sha256 base64 with secret variation %d", i)
			return true
		}
	}

	// 2. Try base64 decoding and byte comparison
	if decoded, err := base64.StdEncoding.DecodeString(header); err == nil {
		if hmac.Equal(decoded, sha1Expected) {
			log.Println("Signature matched decoded sha1 bytes")
			return true
		}
		if hmac.Equal(decoded, sha256Expected) {
			log.Println("Signature matched decoded sha256 bytes")
			return true
		}
	}

	// 3. Try hex decoding
	if decoded, err := hex.DecodeString(header); err == nil {
		if hmac.Equal(decoded, sha1Expected) {
			log.Println("Signature matched hex decoded sha1")
			return true
		}
		if hmac.Equal(decoded, sha256Expected) {
			log.Println("Signature matched hex decoded sha256")
			return true
		}
	}

	// 4. Handle comma-separated signatures (multiple signatures in header)
	parts := strings.Split(header, ",")
	for _, part := range parts {
		sig := strings.TrimSpace(part)
		lower := strings.ToLower(sig)

		// Handle prefixed signatures
		if strings.HasPrefix(lower, "sha256=") {
			providedHex := strings.TrimSpace(sig[7:])
			if providedBytes, err := hex.DecodeString(providedHex); err == nil {
				if hmac.Equal(providedBytes, sha256Expected) {
					log.Println("Signature matched sha256 prefix")
					return true
				}
			}
			continue
		}

		if strings.HasPrefix(lower, "sha1=") {
			candidate := strings.TrimSpace(sig[5:])
			if strings.EqualFold(candidate, sha1Base64) {
				log.Println("Signature matched sha1 prefix")
				return true
			}
			if decoded, err := base64.StdEncoding.DecodeString(candidate); err == nil {
				if hmac.Equal(decoded, sha1Expected) {
					log.Println("Signature matched sha1 prefix (decoded b64)")
					return true
				}
			}
			continue
		}

		// Try direct comparison for each part
		if strings.EqualFold(sig, sha1Base64) {
			log.Println("Signature matched sha1 base64 in parts")
			return true
		}
		if strings.EqualFold(sig, sha256Hex) {
			log.Println("Signature matched sha256 hex in parts")
			return true
		}
		if strings.EqualFold(sig, sha256Base64) {
			log.Println("Signature matched sha256 base64 in parts")
			return true
		}
	}

	// 5. Legacy support for base64-encoded hex strings
	if decoded, err := base64.StdEncoding.DecodeString(header); err == nil {
		if len(decoded) == len(sha1Expected)*2 {
			if hexCandidate, err := hex.DecodeString(string(decoded)); err == nil && hmac.Equal(hexCandidate, sha1Expected) {
				log.Println("Signature matched base64-encoded sha1 hex")
				return true
			}
		}
		if len(decoded) == len(sha256Expected)*2 {
			if hexCandidate, err := hex.DecodeString(string(decoded)); err == nil && hmac.Equal(hexCandidate, sha256Expected) {
				log.Println("Signature matched base64-encoded sha256 hex")
				return true
			}
		}
	}

	log.Printf("Signature mismatch. Provided header: %s | Expected sha1=%s or sha256=%s", header, sha1Base64, sha256Hex)
	return false
}

// isDuplicateEvent checks if we've already processed this event recently.
// This prevents duplicate processing of the same webhook events.
func (h *WebhookHandler) isDuplicateEvent(eventID, eventType string) bool {
	h.mutex.Lock()
	defer h.mutex.Unlock()
	
	// Clean up old entries (older than 1 hour) to prevent memory leaks
	cutoff := time.Now().Add(-1 * time.Hour)
	for id, timestamp := range h.processedEvents {
		if timestamp.Before(cutoff) {
			delete(h.processedEvents, id)
		}
	}
	
	// Create a unique key for this event
	eventKey := fmt.Sprintf("%s:%s", eventID, eventType)
	
	// Check if we've seen this event recently (within 5 minutes)
	if timestamp, exists := h.processedEvents[eventKey]; exists {
		if time.Since(timestamp) < 5*time.Minute {
			return true
		}
	}
	
	// Mark this event as processed
	h.processedEvents[eventKey] = time.Now()
	return false
}

func (h *WebhookHandler) routeEvent(ctx context.Context, event domain.AnchorWebhookEvent, anchorCustomerID string) (func() error, bool) {
	if routingKey, message, ok := h.buildCustomerEvent(event, anchorCustomerID); ok {
		return func() error {
			if message == nil {
				return nil
			}
			return h.producer.Publish(ctx, "customer_events", routingKey, message)
		}, true
	}

	if payload, ok := h.buildTransferEvent(event, anchorCustomerID); ok {
		routingKey := fmt.Sprintf("transfer.status.%s.%s", safeSegment(payload.TransferType, "unknown"), safeSegment(payload.Status, "unknown"))
		return func() error {
			return h.producer.Publish(ctx, "transfa.events", routingKey, payload)
		}, true
	}

	return nil, false
}

func (h *WebhookHandler) buildCustomerEvent(event domain.AnchorWebhookEvent, anchorCustomerID string) (string, any, bool) {
	eventRouting := map[string]string{
		"customer.identification.approved":     "customer.verified",
		"customer.identification.rejected":     "customer.tier.status",
		"customer.identification.manualReview": "customer.tier.status",
		"customer.identification.error":        "customer.tier.status",
		"customer.created":                     "customer.lifecycle",
		"account.initiated":                    "account.lifecycle",
		"account.opened":                       "account.lifecycle",
	}

	routingKey, ok := eventRouting[event.Event]
	if !ok {
		return "", nil, false
	}

	var message any
	switch event.Event {
	case "customer.identification.approved":
		message = domain.CustomerVerifiedEvent{AnchorCustomerID: anchorCustomerID}
	case "customer.identification.rejected":
		reason := extractReason(event.Data.Attributes)
		message = domain.CustomerTierStatusEvent{AnchorCustomerID: anchorCustomerID, Status: "tier2_rejected", Reason: nullableString(reason)}
	case "customer.identification.manualReview":
		message = domain.CustomerTierStatusEvent{AnchorCustomerID: anchorCustomerID, Status: "tier2_manual_review"}
	case "customer.identification.error":
		reason := extractReason(event.Data.Attributes)
		message = domain.CustomerTierStatusEvent{AnchorCustomerID: anchorCustomerID, Status: "tier2_error", Reason: nullableString(reason)}
	case "customer.created":
		message = domain.CustomerTierStatusEvent{AnchorCustomerID: anchorCustomerID, Status: "tier2_customer_created"}
	case "account.initiated":
		message = domain.AccountLifecycleEvent{AnchorCustomerID: anchorCustomerID, EventType: "account_initiated", ResourceID: event.Data.ID}
	case "account.opened":
		message = domain.AccountLifecycleEvent{AnchorCustomerID: anchorCustomerID, EventType: "account_opened", ResourceID: event.Data.ID}
	default:
		return "", nil, false
	}

	return routingKey, message, true
}

func (h *WebhookHandler) buildTransferEvent(event domain.AnchorWebhookEvent, anchorCustomerID string) (domain.TransferStatusEvent, bool) {
	if !(strings.HasPrefix(event.Event, "nip.transfer") || strings.HasPrefix(event.Event, "book.transfer") || strings.HasPrefix(event.Event, "transaction.")) {
		return domain.TransferStatusEvent{}, false
	}

	payload := domain.TransferStatusEvent{
		EventID:          event.Data.ID,
		EventType:        event.Event,
		AnchorCustomerID: anchorCustomerID,
		OccurredAt:       event.CreatedAt,
	}

	if rel, ok := event.Data.Relationships["transfer"]; ok {
		var transferRef domain.RelationshipData
		if err := json.Unmarshal(rel.Data, &transferRef); err == nil && transferRef.ID != "" {
			payload.AnchorTransferID = transferRef.ID
		}
	}

	if rel, ok := event.Data.Relationships["account"]; ok {
		var accountRef domain.RelationshipData
		if err := json.Unmarshal(rel.Data, &accountRef); err == nil && accountRef.ID != "" {
			payload.AnchorAccountID = accountRef.ID
		}
	}

	if rel, ok := event.Data.Relationships["customer"]; ok && payload.AnchorCustomerID == "" {
		var customerRef domain.RelationshipData
		if err := json.Unmarshal(rel.Data, &customerRef); err == nil && customerRef.ID != "" {
			payload.AnchorCustomerID = customerRef.ID
		}
	}

	if rel, ok := event.Data.Relationships["counterParty"]; ok {
		var counterpartyRef domain.RelationshipData
		if err := json.Unmarshal(rel.Data, &counterpartyRef); err == nil {
			payload.CounterpartyID = counterpartyRef.ID
		}
	}

	for _, included := range event.Included {
		typeLower := strings.ToLower(included.Type)
		switch typeLower {
		case "nip_transfer", "book_transfer":
			payload.TransferType = transferTypeFromIncluded(included.Type, payload.TransferType)
			if status, ok := stringFromMap(included.Attributes, "status"); ok {
				payload.Status = strings.ToLower(status)
			}
			if reason, ok := stringFromMap(included.Attributes, "reason"); ok {
				payload.Reason = decodeReason(reason)
			}
			if amount, ok := int64FromMap(included.Attributes, "amount"); ok {
				payload.Amount = amount
			}
			if currency, ok := stringFromMap(included.Attributes, "currency"); ok {
				payload.Currency = currency
			}
			if sessionID, ok := stringFromMap(included.Attributes, "sessionId"); ok {
				payload.SessionID = sessionID
			}
		case "niptransferhistory", "booktransferhistory", "nip_transfer_history", "book_transfer_history":
			if status, ok := stringFromMap(included.Attributes, "status"); ok {
				payload.Status = strings.ToLower(status)
			}
			if message, ok := stringFromMap(included.Attributes, "message"); ok {
				payload.Reason = decodeReason(message)
			}
		}
	}

	if payload.TransferType == "" {
		if strings.HasPrefix(event.Event, "nip.") {
			payload.TransferType = "nip"
		} else if strings.HasPrefix(event.Event, "book.") {
			payload.TransferType = "book"
		}
	}

	if payload.Status == "" {
		parts := strings.Split(event.Event, ".")
		payload.Status = parts[len(parts)-1]
	}

	if payload.Reason == "" {
		if reason, ok := stringFromMap(event.Data.Attributes, "message"); ok {
			payload.Reason = decodeReason(reason)
		} else if reason, ok := stringFromMap(event.Data.Attributes, "detail"); ok {
			payload.Reason = decodeReason(reason)
		}
	}

	return payload, true
}

func transferTypeFromIncluded(rawType, current string) string {
	if current != "" {
		return current
	}
	switch strings.ToLower(rawType) {
	case "nip_transfer":
		return "nip"
	case "book_transfer":
		return "book"
	default:
		return current
	}
}

func stringFromMap(attrs map[string]interface{}, key string) (string, bool) {
	if attrs == nil {
		return "", false
	}
	if value, ok := attrs[key]; ok {
		switch v := value.(type) {
		case string:
			return v, true
		case fmt.Stringer:
			return v.String(), true
		}
	}
	return "", false
}

func int64FromMap(attrs map[string]interface{}, key string) (int64, bool) {
	if attrs == nil {
		return 0, false
	}
	value, ok := attrs[key]
	if !ok {
		return 0, false
	}
	switch v := value.(type) {
	case float64:
		return int64(v), true
	case float32:
		return int64(v), true
	case int64:
		return v, true
	case int:
		return int64(v), true
	case json.Number:
		parsed, err := v.Int64()
		if err == nil {
			return parsed, true
		}
	}
	return 0, false
}

func decodeReason(input string) string {
	if decoded, err := url.QueryUnescape(input); err == nil {
		return decoded
	}
	return input
}

func safeSegment(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}
