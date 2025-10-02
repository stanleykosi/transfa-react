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

	case "customer.created":
		log.Printf("Customer created webhook received for resource ID: %s", event.Data.ID)
		creation := domain.CustomerTierStatusEvent{AnchorCustomerID: event.Data.ID, Status: "tier2_customer_created"}
		if err := h.producer.Publish(ctx, "customer_events", "customer.tier.status", creation); err != nil {
			processingError = err
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
