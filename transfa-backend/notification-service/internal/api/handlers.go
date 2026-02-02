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
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
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

const (
	maxWebhookBodyBytes   int64         = 1 << 20 // 1 MiB
	webhookPublishTimeout time.Duration = 5 * time.Second
	duplicateRetention    time.Duration = 24 * time.Hour
)

// WebhookHandler processes incoming webhooks from Anchor.
type WebhookHandler struct {
	producer        *rabbitmq.EventProducer
	secrets         []string
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
		secrets:         parseWebhookSecrets(secret),
		processedEvents: make(map[string]time.Time),
	}
}

// ServeHTTP implements the http.Handler interface.
func (h *WebhookHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	requestID := r.Header.Get("X-Request-ID")
	if requestID == "" {
		requestID = fmt.Sprintf("req_%d", time.Now().UnixNano())
	}

	log.Printf("[%s] Webhook request started from %s", requestID, r.RemoteAddr)

	r.Body = http.MaxBytesReader(w, r.Body, maxWebhookBodyBytes)
	defer r.Body.Close()

	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("[%s] Error reading webhook body: %v", requestID, err)
		status := http.StatusBadRequest
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			status = http.StatusRequestEntityTooLarge
		}
		http.Error(w, "Invalid request body", status)
		return
	}
	if len(body) == 0 {
		log.Printf("[%s] Empty webhook body", requestID)
		http.Error(w, "Empty request body", http.StatusBadRequest)
		return
	}

	signatureHeader := r.Header.Get("x-anchor-signature")
	if !h.isValidSignature(signatureHeader, body) {
		log.Printf("[%s] Error: Invalid webhook signature", requestID)
		http.Error(w, "Invalid signature", http.StatusBadRequest)
		return
	}

	event, err := decodeAnchorWebhook(body)
	if err != nil {
		log.Printf("[%s] Error decoding webhook JSON: %v", requestID, err)
		http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
		return
	}

	if event.Event == "" {
		log.Printf("[%s] Webhook missing event type", requestID)
		http.Error(w, "Missing event type", http.StatusBadRequest)
		return
	}
	if event.CreatedAt.IsZero() {
		event.CreatedAt = time.Now().UTC()
	}

	anchorCustomerID := event.Data.ID
	if id := extractAnchorCustomerID(event); id != "" {
		anchorCustomerID = id
	}

	eventKey := buildEventKey(event, body)
	if eventKey != "" && h.isDuplicateEvent(eventKey) {
		log.Printf("[%s] Duplicate event detected and ignored: %s for event ID: %s", requestID, event.Event, eventKey)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Duplicate webhook ignored"))
		return
	}

	log.Printf("[%s] Received webhook event: %s for event ID: %s (anchor customer: %s)", requestID, event.Event, event.Data.ID, anchorCustomerID)

	ctx, cancel := context.WithTimeout(context.Background(), webhookPublishTimeout)
	defer cancel()

	if handler, ok := h.routeEvent(ctx, event, anchorCustomerID); ok {
		if err := handler(); err != nil {
			log.Printf("[%s] Failed to process event %s: %v", requestID, event.Event, err)
			http.Error(w, "Failed to process webhook", http.StatusInternalServerError)
			return
		}
	} else {
		log.Printf("[%s] Unhandled webhook event type: %s", requestID, event.Event)
	}

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

func decodeAnchorWebhook(body []byte) (domain.AnchorWebhookEvent, error) {
	var event domain.AnchorWebhookEvent
	if err := json.Unmarshal(body, &event); err != nil {
		return event, err
	}

	event.Event = resolveEventName(event, body)
	event.CreatedAt = resolveEventTimestamp(event)

	return event, nil
}

func resolveEventName(event domain.AnchorWebhookEvent, body []byte) string {
	if event.Event != "" {
		return event.Event
	}
	if event.Data.Type != "" {
		return event.Data.Type
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return ""
	}
	for _, key := range []string{"event", "eventName", "eventType"} {
		if value, ok := raw[key].(string); ok && value != "" {
			return value
		}
	}
	if data, ok := raw["data"].(map[string]interface{}); ok {
		if value, ok := data["type"].(string); ok && value != "" {
			return value
		}
	}
	return ""
}

func resolveEventTimestamp(event domain.AnchorWebhookEvent) time.Time {
	if !event.CreatedAt.IsZero() {
		return event.CreatedAt
	}

	if createdAt, ok := stringFromMap(event.Data.Attributes, "createdAt"); ok {
		if parsed, ok := parseAnchorTimestamp(createdAt); ok {
			return parsed
		}
	}
	if createdAt, ok := stringFromMap(event.Data.Attributes, "created_at"); ok {
		if parsed, ok := parseAnchorTimestamp(createdAt); ok {
			return parsed
		}
	}

	return time.Time{}
}

func parseAnchorTimestamp(value string) (time.Time, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, false
	}

	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05.999999999",
		"2006-01-02T15:04:05",
	}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed, true
		}
	}
	return time.Time{}, false
}

func buildEventKey(event domain.AnchorWebhookEvent, body []byte) string {
	eventType := event.Event
	if eventType == "" {
		eventType = "unknown"
	}
	if event.Data.ID != "" {
		return fmt.Sprintf("%s:%s", eventType, event.Data.ID)
	}

	sum := sha1.Sum(body)
	return fmt.Sprintf("%s:body:%x", eventType, sum)
}

// isValidSignature validates the webhook signature using Anchor's documented scheme.
func (h *WebhookHandler) isValidSignature(signatureHeader string, body []byte) bool {
	if len(h.secrets) == 0 {
		log.Println("Error: ANCHOR_WEBHOOK_SECRET is not set. Rejecting webhook.")
		return false
	}

	signature := normalizeSignatureHeader(signatureHeader)
	if signature == "" {
		log.Println("Missing x-anchor-signature header")
		return false
	}

	for _, secret := range h.secrets {
		expected := anchorSignature(secret, body)
		if hmac.Equal([]byte(signature), []byte(expected)) {
			return true
		}
	}

	log.Printf("Signature mismatch. Provided header: %s", signature)
	return false
}

func normalizeSignatureHeader(header string) string {
	header = strings.TrimSpace(header)
	if header == "" {
		return ""
	}

	for _, part := range strings.Split(header, ",") {
		candidate := strings.TrimSpace(part)
		if candidate == "" {
			continue
		}

		lower := strings.ToLower(candidate)
		if strings.HasPrefix(lower, "sha256=") {
			continue
		}
		if strings.HasPrefix(lower, "sha1=") {
			candidate = strings.TrimSpace(candidate[5:])
		}
		if candidate != "" {
			return candidate
		}
	}

	return ""
}

func anchorSignature(secret string, body []byte) string {
	sha1Mac := hmac.New(sha1.New, []byte(secret))
	sha1Mac.Write(body)
	sha1Raw := sha1Mac.Sum(nil)

	hexLower := hex.EncodeToString(sha1Raw)
	return base64.StdEncoding.EncodeToString([]byte(hexLower))
}

// isDuplicateEvent checks if we've already processed this event recently.
// This prevents duplicate processing of the same webhook events.
func (h *WebhookHandler) isDuplicateEvent(eventKey string) bool {
	h.mutex.Lock()
	defer h.mutex.Unlock()

	cutoff := time.Now().Add(-duplicateRetention)
	for id, timestamp := range h.processedEvents {
		if timestamp.Before(cutoff) {
			delete(h.processedEvents, id)
		}
	}

	if _, exists := h.processedEvents[eventKey]; exists {
		return true
	}

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
		normalizedStatus := normalizeTransferStatus(payload.Status)
		routingKey := fmt.Sprintf("transfer.status.%s.%s", safeSegment(payload.TransferType, "unknown"), safeSegment(normalizedStatus, "unknown"))
		payload.Status = normalizedStatus
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

func normalizeTransferStatus(status string) string {
	s := strings.TrimSpace(strings.ToLower(status))
	switch s {
	case "completed", "success", "successful":
		return "successful"
	case "fail", "failed", "failure":
		return "failed"
	case "initiated", "pending", "processing", "in_progress":
		return "processing"
	default:
		return s
	}
}

func parseWebhookSecrets(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}

	splitFn := func(r rune) bool {
		switch r {
		case ',', ';', '|':
			return true
		default:
			return false
		}
	}

	parts := strings.FieldsFunc(raw, splitFn)
	if len(parts) == 0 {
		return []string{strings.TrimSpace(strings.Trim(raw, "\"'"))}
	}

	ordered := make([]string, 0, len(parts))
	seen := make(map[string]struct{})
	for _, part := range parts {
		candidate := strings.TrimSpace(strings.Trim(part, "\"'"))
		if candidate == "" {
			continue
		}
		if _, ok := seen[candidate]; ok {
			continue
		}
		seen[candidate] = struct{}{}
		ordered = append(ordered, candidate)
	}

	if len(ordered) == 0 {
		ordered = append(ordered, strings.TrimSpace(strings.Trim(raw, "\"'")))
	}

	return ordered
}
