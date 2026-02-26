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

func inferTierStageFromAttrs(attrs map[string]interface{}) string {
	if attrs == nil {
		return ""
	}

	if stage := normalizeTierStageLabel(toString(attrs["stage"])); stage != "" {
		return stage
	}
	if stage := normalizeTierStageLabel(toString(attrs["level"])); stage != "" {
		return stage
	}
	if stage := normalizeTierStageLabel(toString(attrs["verificationLevel"])); stage != "" {
		return stage
	}

	if verification, ok := attrs["verification"].(map[string]interface{}); ok {
		if stage := normalizeTierStageLabel(toString(verification["level"])); stage != "" {
			return stage
		}
		if stage := normalizeTierStageLabel(toString(verification["verificationLevel"])); stage != "" {
			return stage
		}
	}
	if stage := normalizeTierStageLabel(toString(attrs["kycTier"])); stage != "" {
		return stage
	}
	if stage := normalizeTierStageLabel(toString(attrs["kyc_level"])); stage != "" {
		return stage
	}

	// With supportIncluded enabled, verification payloads may expose level-specific objects.
	if _, ok := attrs["level3"]; ok {
		return "tier3"
	}
	if _, ok := attrs["level2"]; ok {
		return "tier2"
	}
	if _, ok := attrs["level1"]; ok {
		return "tier1"
	}

	return ""
}

func inferTierStageFromEvent(event domain.AnchorWebhookEvent) string {
	if stage := inferTierStageFromAttrs(event.Data.Attributes); stage != "" {
		return stage
	}

	for _, included := range event.Included {
		if stage := inferTierStageFromAttrs(included.Attributes); stage != "" {
			return stage
		}
	}

	return ""
}

func inferTierStatusFromAttrs(attrs map[string]interface{}) string {
	if attrs == nil {
		return ""
	}

	for _, key := range []string{"status", "kycStatus", "verificationStatus", "state"} {
		if value := strings.TrimSpace(toString(attrs[key])); value != "" {
			return value
		}
	}

	if verification, ok := attrs["verification"].(map[string]interface{}); ok {
		for _, key := range []string{"status", "state"} {
			if value := strings.TrimSpace(toString(verification[key])); value != "" {
				return value
			}
		}
	}

	return ""
}

func normalizeTierStageLabel(raw string) string {
	normalized := strings.ToUpper(strings.TrimSpace(raw))
	normalized = strings.ReplaceAll(normalized, "-", "_")
	normalized = strings.ReplaceAll(normalized, " ", "_")
	normalized = strings.TrimPrefix(normalized, "KYC_")
	switch normalized {
	case "TIER_1", "TIER1", "1":
		return "tier1"
	case "TIER_2", "TIER2", "2":
		return "tier2"
	case "TIER_3", "TIER3", "3":
		return "tier3"
	default:
		return ""
	}
}

func toString(value interface{}) string {
	if typed, ok := value.(string); ok {
		return typed
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
	startedAt := time.Now()
	requestID := r.Header.Get("X-Request-ID")
	if requestID == "" {
		requestID = fmt.Sprintf("req_%d", time.Now().UnixNano())
	}

	r.Body = http.MaxBytesReader(w, r.Body, maxWebhookBodyBytes)
	defer r.Body.Close()

	body, err := io.ReadAll(r.Body)
	if err != nil {
		status := http.StatusBadRequest
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			status = http.StatusRequestEntityTooLarge
		}
		log.Printf("level=warn component=webhook request_id=%s outcome=reject reason=invalid_body status=%d err=%v", requestID, status, err)
		http.Error(w, "Invalid request body", status)
		return
	}
	if len(body) == 0 {
		log.Printf("level=warn component=webhook request_id=%s outcome=reject reason=empty_body", requestID)
		http.Error(w, "Empty request body", http.StatusBadRequest)
		return
	}

	signatureHeader := r.Header.Get("x-anchor-signature")
	signatureBodies := buildSignatureBodies(body, r.Header.Get("Content-Encoding"))
	authMethod := "signature"
	if !h.isValidSignature(signatureHeader, signatureBodies...) {
		fallbackBody, eventType, eventID := previewWebhookEventCandidates(signatureBodies)
		bodyHash := sha1.Sum(body)
		if h.verifyAnchorEventFallback(r.Context(), fallbackBody, eventType, eventID) {
			authMethod = "anchor_fallback"
			log.Printf("level=info component=webhook request_id=%s outcome=fallback_auth event=%s event_id=%s body_sha1=%x", requestID, safeSegment(eventType, "unknown"), safeSegment(eventID, "unknown"), bodyHash)
		} else {
			log.Printf("level=warn component=webhook request_id=%s outcome=reject reason=invalid_signature event=%s event_id=%s body_sha1=%x content_encoding=%q content_type=%q content_length=%d", requestID, safeSegment(eventType, "unknown"), safeSegment(eventID, "unknown"), bodyHash, r.Header.Get("Content-Encoding"), r.Header.Get("Content-Type"), r.ContentLength)
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
		log.Printf("level=warn component=webhook request_id=%s outcome=reject reason=invalid_json err=%v", requestID, err)
		http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
		return
	}

	if event.Event == "" {
		log.Printf("level=warn component=webhook request_id=%s outcome=reject reason=missing_event_type", requestID)
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
		log.Printf("level=info component=webhook request_id=%s outcome=duplicate event=%s event_id=%s auth=%s duration_ms=%d", requestID, event.Event, event.Data.ID, authMethod, time.Since(startedAt).Milliseconds())
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Duplicate webhook ignored"))
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), webhookPublishTimeout)
	defer cancel()

	outcome := "accepted"
	if handler, ok := h.routeEvent(ctx, event, anchorCustomerID); ok {
		if err := handler(); err != nil {
			log.Printf("level=error component=webhook request_id=%s outcome=process_error event=%s event_id=%s err=%v", requestID, event.Event, event.Data.ID, err)
			http.Error(w, "Failed to process webhook", http.StatusInternalServerError)
			return
		}
	} else {
		outcome = "ignored"
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Webhook received"))
	log.Printf("level=info component=webhook request_id=%s outcome=%s event=%s event_id=%s customer_id=%s auth=%s duration_ms=%d", requestID, outcome, event.Event, event.Data.ID, safeSegment(anchorCustomerID, "unknown"), authMethod, time.Since(startedAt).Milliseconds())
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

func previewWebhookEventCandidates(bodies [][]byte) ([]byte, string, string) {
	for _, candidate := range bodies {
		eventType, eventID := previewWebhookEvent(candidate)
		if strings.TrimSpace(eventType) != "" && strings.TrimSpace(eventID) != "" {
			return candidate, eventType, eventID
		}
	}

	if len(bodies) == 0 {
		return nil, "", ""
	}

	eventType, eventID := previewWebhookEvent(bodies[0])
	return bodies[0], eventType, eventID
}

// isValidSignature validates the webhook signature using Anchor's documented scheme.
func (h *WebhookHandler) isValidSignature(signatureHeader string, bodies ...[]byte) bool {
	if len(h.secrets) == 0 {
		return false
	}

	signatureCandidates := normalizeSignatureHeader(signatureHeader)
	if len(signatureCandidates) == 0 {
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
	if len(body) == 0 {
		return false
	}

	localEvent, err := decodeAnchorWebhook(body)
	if err != nil {
		return false
	}

	if strings.TrimSpace(eventType) == "" {
		eventType = localEvent.Event
	}
	if strings.TrimSpace(eventID) == "" {
		eventID = localEvent.Data.ID
	}

	eventType = strings.TrimSpace(eventType)
	eventID = strings.TrimSpace(eventID)
	if eventType == "" || eventID == "" {
		return false
	}
	if h.anchorAPIKey == "" {
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
			return h.producer.Publish(ctx, "transfa.events", routingKey, payload)
		}, true
	}

	return nil, false
}

func (h *WebhookHandler) buildCustomerEvent(event domain.AnchorWebhookEvent, anchorCustomerID string) (string, any, bool) {
	eventRouting := map[string]string{
		"customer.identification.approved":            "customer.tier.status",
		"customer.identification.rejected":            "customer.tier.status",
		"customer.identification.manualReview":        "customer.tier.status",
		"customer.identification.awaitingDocument":    "customer.tier.status",
		"customer.identification.awaiting_document":   "customer.tier.status",
		"customer.identification.reenter_information": "customer.tier.status",
		"customer.identification.reenterInformation":  "customer.tier.status",
		"customer.identification.pending":             "customer.tier.status",
		"customer.identification.error":               "customer.tier.status",
		"kyc.status.update":                           "customer.tier.status",
		"customer.created":                            "customer.tier.status",
		"account.initiated":                           "account.lifecycle",
		"account.opened":                              "account.lifecycle",
	}

	routingKey, ok := eventRouting[event.Event]
	if !ok {
		return "", nil, false
	}

	var message any
	stage := inferTierStageFromEvent(event)
	switch event.Event {
	case "customer.identification.approved":
		message = domain.CustomerTierStatusEvent{
			AnchorCustomerID: anchorCustomerID,
			Stage:            stage,
			Status:           "completed",
		}
	case "customer.identification.rejected":
		reason := extractReason(event.Data.Attributes)
		message = domain.CustomerTierStatusEvent{AnchorCustomerID: anchorCustomerID, Stage: stage, Status: "rejected", Reason: nullableString(reason)}
	case "customer.identification.manualReview":
		message = domain.CustomerTierStatusEvent{AnchorCustomerID: anchorCustomerID, Stage: stage, Status: "manual_review"}
	case "customer.identification.awaitingDocument":
		fallthrough
	case "customer.identification.awaiting_document":
		reason := extractReason(event.Data.Attributes)
		message = domain.CustomerTierStatusEvent{AnchorCustomerID: anchorCustomerID, Stage: stage, Status: "awaiting_document", Reason: nullableString(reason)}
	case "customer.identification.reenter_information":
		fallthrough
	case "customer.identification.reenterInformation":
		reason := extractReason(event.Data.Attributes)
		message = domain.CustomerTierStatusEvent{AnchorCustomerID: anchorCustomerID, Stage: stage, Status: "reenter_information", Reason: nullableString(reason)}
	case "customer.identification.pending":
		message = domain.CustomerTierStatusEvent{AnchorCustomerID: anchorCustomerID, Stage: stage, Status: "pending"}
	case "customer.identification.error":
		reason := extractReason(event.Data.Attributes)
		message = domain.CustomerTierStatusEvent{AnchorCustomerID: anchorCustomerID, Stage: stage, Status: "error", Reason: nullableString(reason)}
	case "kyc.status.update":
		status := inferTierStatusFromAttrs(event.Data.Attributes)
		if strings.TrimSpace(status) == "" {
			// Ignore malformed updates without status to avoid downstream ambiguity.
			return "", nil, false
		}
		reason := extractReason(event.Data.Attributes)
		message = domain.CustomerTierStatusEvent{
			AnchorCustomerID: anchorCustomerID,
			Stage:            stage,
			Status:           status,
			Reason:           nullableString(reason),
		}
	case "customer.created":
		message = domain.CustomerTierStatusEvent{AnchorCustomerID: anchorCustomerID, Stage: "tier1", Status: "created"}
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
