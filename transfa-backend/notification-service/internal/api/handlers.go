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
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/transfa/notification-service/internal/domain"
	"github.com/transfa/notification-service/pkg/rabbitmq"
)

// WebhookHandler processes incoming webhooks from Anchor.
type WebhookHandler struct {
	producer *rabbitmq.EventProducer
	secret   string
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
		producer: producer,
		secret:   secret,
	}
}

// ServeHTTP implements the http.Handler interface.
func (h *WebhookHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// 1. Read the request body. We need to read it once for signature validation
	// and then again for decoding, so we buffer it.
	body, err := io.ReadAll(r.Body)
	if err != nil {
		log.Printf("Error reading webhook body: %v", err)
		http.Error(w, "Cannot read request body", http.StatusBadRequest)
		return
	}
	// Restore the body for subsequent reads.
	r.Body = io.NopCloser(bytes.NewBuffer(body))

	// 2. Validate the signature for security.
	if !h.isValidSignature(r.Header.Get("x-anchor-signature"), body) {
		log.Println("Error: Invalid webhook signature")
		http.Error(w, "Invalid signature", http.StatusUnauthorized)
		return
	}

	// 3. Decode the webhook payload.
	var event domain.AnchorWebhookEvent
	if err := json.Unmarshal(body, &event); err != nil {
		log.Printf("Error decoding webhook JSON: %v", err)
		http.Error(w, "Invalid JSON payload", http.StatusBadRequest)
		return
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
			log.Printf("Webhook missing event field. Raw payload: %s", string(body))
		}
	}

	anchorCustomerID := event.Data.ID
	if id := extractAnchorCustomerID(event); id != "" {
		anchorCustomerID = id
	}

	log.Printf("Received webhook event: %s for resource ID: %s (anchor customer: %s)", event.Event, event.Data.ID, anchorCustomerID)

	// 4. Process the event based on its type.
	ctx := r.Context()

	eventRouting := map[string]string{
		"customer.identification.approved":     "customer.verified",
		"customer.identification.rejected":     "customer.tier.status",
		"customer.identification.manualReview": "customer.tier.status",
		"customer.identification.error":        "customer.tier.status",
		"customer.created":                     "customer.lifecycle",
	}

	routingKey, known := eventRouting[event.Event]
	if !known {
		log.Printf("Unhandled webhook event type: %s", event.Event)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Webhook received"))
		return
	}

	var message any
	switch event.Event {
	case "customer.identification.approved":
		message = domain.CustomerVerifiedEvent{AnchorCustomerID: anchorCustomerID}
	case "customer.identification.rejected":
		message = domain.CustomerTierStatusEvent{AnchorCustomerID: anchorCustomerID, Status: "tier2_rejected", Reason: extractReason(event.Data.Attributes)}
	case "customer.identification.manualReview":
		message = domain.CustomerTierStatusEvent{AnchorCustomerID: anchorCustomerID, Status: "tier2_manual_review"}
	case "customer.identification.error":
		reason := extractReason(event.Data.Attributes)
		message = domain.CustomerTierStatusEvent{AnchorCustomerID: anchorCustomerID, Status: "tier2_error", Reason: reason}
	case "customer.created":
		message = domain.CustomerTierStatusEvent{AnchorCustomerID: anchorCustomerID, Status: "tier2_customer_created"}
	}

	if err := h.producer.Publish(ctx, "customer_events", routingKey, message); err != nil {
		log.Printf("Failed to publish %s: %v", routingKey, err)
		http.Error(w, "Internal server error during event processing", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Webhook received"))
}

func extractAnchorCustomerID(event domain.AnchorWebhookEvent) string {
	if rel, ok := event.Data.Relationships["customer"]; ok {
		if rel.Data != nil && rel.Data.ID != "" {
			return rel.Data.ID
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

// isValidSignature validates the HMAC-SHA1 signature of the webhook.
// signature = Base64(HMAC_SHA1(request_body, secret_token))
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

	sha1Mac := hmac.New(sha1.New, []byte(h.secret))
	sha1Mac.Write(body)
	sha1Expected := sha1Mac.Sum(nil)
	sha1Base64 := base64.StdEncoding.EncodeToString(sha1Expected)
	sha1Hex := hex.EncodeToString(sha1Expected)

	sha256Mac := hmac.New(sha256.New, []byte(h.secret))
	sha256Mac.Write(body)
	sha256Expected := sha256Mac.Sum(nil)
	sha256Hex := hex.EncodeToString(sha256Expected)

	log.Printf("Debug signature check: provided=%s | expected sha1=%s | expected sha256=%s", header, sha1Base64, sha256Hex)

	if decoded, err := base64.StdEncoding.DecodeString(header); err == nil {
		if bytes.Equal(decoded, sha1Expected) {
			log.Println("Signature matched raw sha1 bytes (primary)")
			return true
		}
		if bytes.Equal(decoded, sha256Expected) {
			log.Println("Signature matched raw sha256 bytes (primary)")
			return true
		}
		if len(decoded) == len(sha1Expected)*2 {
			if hexCandidate, err := hex.DecodeString(string(decoded)); err == nil && bytes.Equal(hexCandidate, sha1Expected) {
				log.Println("Signature matched base64-encoded sha1 hex (primary)")
				return true
			}
		}
		if len(decoded) == len(sha256Expected)*2 {
			if hexCandidate, err := hex.DecodeString(string(decoded)); err == nil && bytes.Equal(hexCandidate, sha256Expected) {
				log.Println("Signature matched base64-encoded sha256 hex (primary)")
				return true
			}
		}
	}

	parts := strings.Split(header, ",")
	for _, part := range parts {
		sig := strings.TrimSpace(part)
		lower := strings.ToLower(sig)

		if strings.HasPrefix(lower, "sha256=") {
			providedHex := strings.TrimSpace(sig[7:])
			if providedBytes, err := hex.DecodeString(providedHex); err == nil {
				if hmac.Equal(providedBytes, sha256Expected) {
					log.Println("Signature matched sha256 prefix")
					return true
				}
			} else {
				log.Printf("Invalid sha256 signature format: %v", err)
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

		if strings.EqualFold(sig, sha1Base64) {
			log.Println("Signature matched legacy sha1 base64")
			return true
		}

		if decoded, err := base64.StdEncoding.DecodeString(sig); err == nil {
			if hmac.Equal(decoded, sha1Expected) {
				log.Println("Signature matched decoded sha1 bytes")
				return true
			}
			if hmac.Equal(decoded, sha256Expected) {
				log.Println("Signature matched decoded sha256 bytes")
				return true
			}
			if len(decoded) == len(sha1Expected) && hmac.Equal(decoded, sha1Expected) {
				log.Println("Signature matched decoded sha1 raw length")
				return true
			}
			if len(decoded) == len(sha256Expected) && hmac.Equal(decoded, sha256Expected) {
				log.Println("Signature matched decoded sha256 raw length")
				return true
			}
			if hexCandidate := strings.TrimSpace(string(decoded)); len(hexCandidate) == len(sha1Hex) {
				if b, err := hex.DecodeString(hexCandidate); err == nil && hmac.Equal(b, sha1Expected) {
					log.Println("Signature matched ascii hex sha1")
					return true
				}
			}
			if hexCandidate := strings.TrimSpace(string(decoded)); len(hexCandidate) == len(sha256Hex) {
				if b, err := hex.DecodeString(hexCandidate); err == nil && hmac.Equal(b, sha256Expected) {
					log.Println("Signature matched ascii hex sha256")
					return true
				}
			}
		}
	}

	log.Printf("Signature mismatch. Provided header: %s | Expected sha256=%s or sha1=%s", header, sha256Hex, sha1Base64)
	return false
}
