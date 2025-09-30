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

	log.Printf("Received webhook event: %s for resource ID: %s", event.Event, event.Data.ID)

	// 4. Process the event based on its type.
	ctx := r.Context()
	var processingError error

	switch event.Event {
	case "customer.identification.approved":
		// This event signifies that a user's KYC is complete and an account can be created.
		// We publish a new, internal event for the account-service to consume.
		internalEvent := domain.CustomerVerifiedEvent{AnchorCustomerID: event.Data.ID}
		err := h.producer.Publish(ctx, "customer_events", "customer.verified", internalEvent)
		if err != nil {
			processingError = err
			log.Printf("Failed to publish customer.verified event: %v", err)
		}

	case "customer.identification.rejected":
		log.Printf("KYC rejected for customer %s. Attributes: %v", event.Data.ID, event.Data.Attributes)
        rejection := domain.CustomerTierStatusEvent{
			AnchorCustomerID: event.Data.ID,
			Status:           "tier2_rejected",
			Reason:           extractReason(event.Data.Attributes),
		}
		if err := h.producer.Publish(ctx, "customer_events", "customer.tier.status", rejection); err != nil {
			processingError = err
		}

	case "customer.identification.manualReview":
		log.Printf("KYC manual review for customer %s", event.Data.ID)
		manual := domain.CustomerTierStatusEvent{AnchorCustomerID: event.Data.ID, Status: "tier2_manual_review"}
		if err := h.producer.Publish(ctx, "customer_events", "customer.tier.status", manual); err != nil {
			processingError = err
		}

	case "customer.identification.error":
		errStatus := domain.CustomerTierStatusEvent{
			AnchorCustomerID: event.Data.ID,
			Status:           "tier2_error",
			Reason:           extractReason(event.Data.Attributes),
		}
		if err := h.producer.Publish(ctx, "customer_events", "customer.tier.status", errStatus); err != nil {
			processingError = err
		}

	case "nip.inbound.completed":
		// Handle incoming funds.
		log.Printf("Incoming transfer completed for account associated with resource ID: %s", event.Data.ID)
		// TODO: Publish an event for the transaction-service to update the user's wallet balance.

	default:
		log.Printf("Unhandled webhook event type: %s", event.Event)
	}

	// 5. Respond to Anchor.
	if processingError != nil {
		// If publishing to RabbitMQ failed, we should signal an error so Anchor might retry.
		http.Error(w, "Internal server error during event processing", http.StatusInternalServerError)
	} else {
		// Acknowledge receipt of the webhook.
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Webhook received"))
	}
}

// isValidSignature validates the HMAC-SHA1 signature of the webhook.
// signature = Base64(HMAC_SHA1(request_body, secret_token))
func (h *WebhookHandler) isValidSignature(signatureHeader string, body []byte) bool {
    if h.secret == "" {
        log.Println("Warning: ANCHOR_WEBHOOK_SECRET is not set. Skipping signature validation.")
        return true
    }

    header := strings.TrimSpace(signatureHeader)
    if strings.HasPrefix(strings.ToLower(header), "sha256=") {
        provided, err := hex.DecodeString(header[7:])
        if err != nil {
            log.Printf("Invalid hex signature: %v", err)
            return false
        }
        mac := hmac.New(sha256.New, []byte(h.secret))
        mac.Write(body)
        expected := mac.Sum(nil)
        return hmac.Equal(provided, expected)
    }

    // Legacy SHA1 support
    mac := hmac.New(sha1.New, []byte(h.secret))
    mac.Write(body)
    expectedMAC := mac.Sum(nil)
    expectedSignature := base64.StdEncoding.EncodeToString(expectedMAC)
    return hmac.Equal([]byte(header), []byte(expectedSignature))
}
