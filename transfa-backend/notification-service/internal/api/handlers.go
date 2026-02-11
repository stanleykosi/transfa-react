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
	"compress/gzip"
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
	anchorAPIKey    string
	anchorAPIBase   string
	httpClient      *http.Client
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
func NewWebhookHandler(producer *rabbitmq.EventProducer, secret string, anchorAPIKey string, anchorAPIBaseURL string) *WebhookHandler {
	anchorAPIBaseURL = strings.TrimSpace(anchorAPIBaseURL)
	if anchorAPIBaseURL == "" {
		anchorAPIBaseURL = "https://api.sandbox.getanchor.co"
	}

	return &WebhookHandler{
		producer:        producer,
		secrets:         parseWebhookSecrets(secret),
		anchorAPIKey:    strings.TrimSpace(anchorAPIKey),
		anchorAPIBase:   strings.TrimRight(anchorAPIBaseURL, "/"),
		httpClient:      &http.Client{Timeout: 5 * time.Second},
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
	signatureBodies := buildSignatureBodies(body, r.Header.Get("Content-Encoding"))
	if !h.isValidSignature(signatureHeader, signatureBodies...) {
		eventType, eventID := previewWebhookEvent(body)
		bodyHash := sha1.Sum(body)
		if h.verifyAnchorEventFallback(r.Context(), body, eventType, eventID) {
			log.Printf("[%s] WARN: Signature mismatch but Anchor API fallback verification succeeded (event=%s id=%s body_sha1=%x)", requestID, safeSegment(eventType, "unknown"), safeSegment(eventID, "unknown"), bodyHash)
		} else {
			log.Printf("[%s] Error: Invalid webhook signature (event=%s id=%s body_sha1=%x content_encoding=%q content_type=%q content_length=%d)", requestID, safeSegment(eventType, "unknown"), safeSegment(eventID, "unknown"), bodyHash, r.Header.Get("Content-Encoding"), r.Header.Get("Content-Type"), r.ContentLength)
			http.Error(w, "Invalid signature", http.StatusBadRequest)
			return
		}
	}

	event, err := decodeAnchorWebhook(body)
	if err != nil && len(signatureBodies) > 1 {
		for _, candidate := range signatureBodies[1:] {
			event, err = decodeAnchorWebhook(candidate)
			if err == nil {
				break
			}
		}
	}
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

func previewWebhookEvent(body []byte) (eventType string, eventID string) {
	var raw map[string]any
	if err := json.Unmarshal(body, &raw); err != nil {
		return "", ""
	}

	if data, ok := raw["data"].(map[string]any); ok {
		if id, ok := data["id"].(string); ok {
			eventID = id
		}
		if typ, ok := data["type"].(string); ok {
			eventType = typ
		}
	}

	if eventType == "" {
		if typ, ok := raw["event"].(string); ok {
			eventType = typ
		}
	}

	return eventType, eventID
}

// isValidSignature validates the webhook signature using Anchor's documented scheme.
func (h *WebhookHandler) isValidSignature(signatureHeader string, bodies ...[]byte) bool {
	if len(h.secrets) == 0 {
		log.Println("Error: ANCHOR_WEBHOOK_SECRET is not set. Rejecting webhook.")
		return false
	}

	signatureCandidates := normalizeSignatureHeader(signatureHeader)
	if len(signatureCandidates) == 0 {
		log.Println("Missing x-anchor-signature header")
		return false
	}

	for _, body := range bodies {
		for _, secret := range h.secrets {
			expectedSignatures := anchorSignatures(secret, body)
			for _, provided := range signatureCandidates {
				for _, expected := range expectedSignatures {
					if hmac.Equal([]byte(provided), []byte(expected)) {
						return true
					}
				}
			}
		}
	}

	log.Printf("Signature mismatch. Provided header: %s", strings.Join(signatureCandidates, ","))
	return false
}

func buildSignatureBodies(body []byte, contentEncoding string) [][]byte {
	candidates := make([][]byte, 0, 2)
	candidates = append(candidates, body)

	if !shouldTryGzipBody(contentEncoding, body) {
		return candidates
	}

	decoded, err := gunzipBody(body)
	if err != nil {
		log.Printf("Webhook gzip decode skipped: %v", err)
		return candidates
	}
	if len(decoded) == 0 {
		return candidates
	}

	candidates = append(candidates, decoded)
	return candidates
}

func shouldTryGzipBody(contentEncoding string, body []byte) bool {
	if strings.Contains(strings.ToLower(contentEncoding), "gzip") {
		return true
	}
	return len(body) >= 2 && body[0] == 0x1f && body[1] == 0x8b
}

func gunzipBody(body []byte) ([]byte, error) {
	reader, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer reader.Close()

	decoded, err := io.ReadAll(io.LimitReader(reader, maxWebhookBodyBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(decoded)) > maxWebhookBodyBytes {
		return nil, fmt.Errorf("decoded webhook body exceeds %d bytes", maxWebhookBodyBytes)
	}
	return decoded, nil
}

type anchorEventLookupResponse struct {
	Data domain.EventResource `json:"data"`
}

// verifyAnchorEventFallback validates webhook authenticity by cross-checking event identity
// with Anchor's Events API when signature verification fails.
func (h *WebhookHandler) verifyAnchorEventFallback(ctx context.Context, body []byte, eventType string, eventID string) bool {
	eventType = strings.TrimSpace(eventType)
	eventID = strings.TrimSpace(eventID)
	if eventType == "" || eventID == "" {
		return false
	}
	if h.anchorAPIKey == "" {
		return false
	}

	localEvent, err := decodeAnchorWebhook(body)
	if err != nil {
		return false
	}

	localTransferID := extractRelationshipID(localEvent.Data.Relationships, "transfer", "bookTransfer", "book_transfer", "nipTransfer", "nip_transfer")
	localCustomerID := extractRelationshipID(localEvent.Data.Relationships, "customer")
	localAccountID := extractRelationshipID(localEvent.Data.Relationships, "account")

	requestCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	endpoint := fmt.Sprintf("%s/api/v1/events/%s", h.anchorAPIBase, url.PathEscape(eventID))
	req, err := http.NewRequestWithContext(requestCtx, http.MethodGet, endpoint, nil)
	if err != nil {
		return false
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("x-anchor-key", h.anchorAPIKey)

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false
	}

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, maxWebhookBodyBytes))
	if err != nil {
		return false
	}

	var lookup anchorEventLookupResponse
	if err := json.Unmarshal(respBody, &lookup); err != nil {
		return false
	}

	if strings.TrimSpace(lookup.Data.ID) != eventID {
		return false
	}
	if !strings.EqualFold(strings.TrimSpace(lookup.Data.Type), eventType) {
		return false
	}

	remoteTransferID := extractRelationshipID(lookup.Data.Relationships, "transfer", "bookTransfer", "book_transfer", "nipTransfer", "nip_transfer")
	remoteCustomerID := extractRelationshipID(lookup.Data.Relationships, "customer")
	remoteAccountID := extractRelationshipID(lookup.Data.Relationships, "account")

	if localTransferID != "" && remoteTransferID != "" && localTransferID != remoteTransferID {
		return false
	}
	if localCustomerID != "" && remoteCustomerID != "" && localCustomerID != remoteCustomerID {
		return false
	}
	if localAccountID != "" && remoteAccountID != "" && localAccountID != remoteAccountID {
		return false
	}

	return true
}

func extractRelationshipID(relationships map[string]domain.Relationship, keys ...string) string {
	if rel, ok := relationshipByKey(relationships, keys...); ok {
		var single domain.RelationshipData
		if err := json.Unmarshal(rel.Data, &single); err == nil && single.ID != "" {
			return single.ID
		}
		var many []domain.RelationshipData
		if err := json.Unmarshal(rel.Data, &many); err == nil {
			for _, item := range many {
				if item.ID != "" {
					return item.ID
				}
			}
		}
	}
	return ""
}

func normalizeSignatureHeader(header string) []string {
	header = strings.TrimSpace(header)
	if header == "" {
		return nil
	}

	// Anchor currently documents HMAC-SHA1 but examples show two equivalent renderings.
	// Accept common header variants robustly while still requiring a matching HMAC.
	parts := strings.FieldsFunc(header, func(r rune) bool {
		return r == ',' || r == ';'
	})

	seen := make(map[string]struct{})
	candidates := make([]string, 0, len(parts)*2)
	appendCandidate := func(value string) {
		value = strings.TrimSpace(strings.Trim(value, "\"'"))
		if value == "" {
			return
		}
		if _, ok := seen[value]; ok {
			return
		}
		seen[value] = struct{}{}
		candidates = append(candidates, value)
	}

	for _, part := range parts {
		candidate := strings.TrimSpace(part)
		if candidate == "" {
			continue
		}

		lower := strings.ToLower(candidate)
		for _, prefix := range []string{"sha1=", "v1=", "signature="} {
			if strings.HasPrefix(lower, prefix) {
				candidate = strings.TrimSpace(candidate[len(prefix):])
				break
			}
		}

		appendCandidate(candidate)

		decoded, err := base64.StdEncoding.DecodeString(candidate)
		if err == nil {
			decodedStr := strings.TrimSpace(string(decoded))
			// Many Anchor examples return base64(hex(hmac_sha1(...))).
			if isHexSHA1(decodedStr) {
				appendCandidate(strings.ToLower(decodedStr))
			}
		}
	}

	return candidates
}

func anchorSignatures(secret string, body []byte) []string {
	variants := [][]byte{
		body,                          // strict raw payload
		bytes.TrimSpace(body),         // tolerate leading/trailing whitespace differences
		bytes.TrimRight(body, "\r\n"), // tolerate newline normalization by intermediaries
	}
	if len(body) > 0 && body[len(body)-1] != '\n' {
		variants = append(variants, append(append([]byte{}, body...), '\n'))
	}

	seen := make(map[string]struct{})
	signatures := make([]string, 0, len(variants)*3)

	appendSignature := func(sig string) {
		if _, ok := seen[sig]; ok {
			return
		}
		seen[sig] = struct{}{}
		signatures = append(signatures, sig)
	}

	for _, variant := range variants {
		sha1Mac := hmac.New(sha1.New, []byte(secret))
		sha1Mac.Write(variant)
		raw := sha1Mac.Sum(nil)
		hexLower := hex.EncodeToString(raw)

		// Matches Anchor examples and current observed traffic.
		appendSignature(base64.StdEncoding.EncodeToString([]byte(hexLower)))
		// Defensive compatibility with "Base64(HMAC_SHA1(...))" interpretation.
		appendSignature(base64.StdEncoding.EncodeToString(raw))
		// Accept direct hex if a proxy/formatter rewrites header.
		appendSignature(hexLower)
	}

	return signatures
}

func isHexSHA1(value string) bool {
	if len(value) != 40 {
		return false
	}
	for _, r := range value {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') && (r < 'A' || r > 'F') {
			return false
		}
	}
	return true
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
			log.Printf("Publishing transfer event: routing_key=%s event_id=%s event_type=%s anchor_transfer_id=%s status=%s anchor_customer_id=%s", routingKey, payload.EventID, payload.EventType, payload.AnchorTransferID, payload.Status, payload.AnchorCustomerID)
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

	if rel, ok := relationshipByKey(event.Data.Relationships, "transfer", "bookTransfer", "book_transfer", "nipTransfer", "nip_transfer"); ok {
		var transferRef domain.RelationshipData
		if err := json.Unmarshal(rel.Data, &transferRef); err == nil && transferRef.ID != "" {
			payload.AnchorTransferID = transferRef.ID
		}
	}

	if rel, ok := relationshipByKey(event.Data.Relationships, "account"); ok {
		var accountRef domain.RelationshipData
		if err := json.Unmarshal(rel.Data, &accountRef); err == nil && accountRef.ID != "" {
			payload.AnchorAccountID = accountRef.ID
		}
	}

	if rel, ok := relationshipByKey(event.Data.Relationships, "customer"); ok && payload.AnchorCustomerID == "" {
		var customerRef domain.RelationshipData
		if err := json.Unmarshal(rel.Data, &customerRef); err == nil && customerRef.ID != "" {
			payload.AnchorCustomerID = customerRef.ID
		}
	}

	if rel, ok := relationshipByKey(event.Data.Relationships, "counterParty", "counterparty", "counter_party"); ok {
		var counterpartyRef domain.RelationshipData
		if err := json.Unmarshal(rel.Data, &counterpartyRef); err == nil {
			payload.CounterpartyID = counterpartyRef.ID
		}
	}

	eventStatus, hasEventStatus := statusFromEventType(event.Event)

	for _, included := range event.Included {
		typeLower := strings.ToLower(included.Type)
		switch typeLower {
		case "nip_transfer", "book_transfer":
			if payload.AnchorTransferID == "" && included.ID != "" {
				payload.AnchorTransferID = included.ID
			}
			payload.TransferType = transferTypeFromIncluded(included.Type, payload.TransferType)
			if !hasEventStatus {
				if status, ok := stringFromMap(included.Attributes, "status"); ok {
					payload.Status = strings.ToLower(status)
				}
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
			if !hasEventStatus {
				if status, ok := stringFromMap(included.Attributes, "status"); ok {
					payload.Status = strings.ToLower(status)
				}
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

	// The event name is the source of truth for event status.
	// Included resources can represent a later snapshot on retries.
	if hasEventStatus {
		payload.Status = eventStatus
	} else if payload.Status == "" {
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

func relationshipByKey(relationships map[string]domain.Relationship, keys ...string) (domain.Relationship, bool) {
	if len(relationships) == 0 || len(keys) == 0 {
		return domain.Relationship{}, false
	}
	for _, key := range keys {
		if rel, ok := relationships[key]; ok {
			return rel, true
		}
	}
	for relationshipKey, rel := range relationships {
		lowerRelationshipKey := strings.ToLower(relationshipKey)
		for _, key := range keys {
			if lowerRelationshipKey == strings.ToLower(key) {
				return rel, true
			}
		}
	}
	return domain.Relationship{}, false
}

func statusFromEventType(eventType string) (string, bool) {
	eventType = strings.TrimSpace(strings.ToLower(eventType))
	if eventType == "" {
		return "", false
	}

	parts := strings.Split(eventType, ".")
	if len(parts) == 0 {
		return "", false
	}

	switch suffix := parts[len(parts)-1]; suffix {
	case "successful", "success", "failed", "failure", "initiated", "processing", "pending", "completed", "reversed":
		return suffix, true
	default:
		return "", false
	}
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
