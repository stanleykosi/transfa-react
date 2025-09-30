/**
 * @description
 * This file defines the Go structs that model the incoming webhook payloads from Anchor.
 * These structures are essential for safely unmarshaling the JSON data received at the
 * webhook endpoint and processing it in a type-safe manner.
 *
 * @notes
 * - The structs are designed to capture the key information from Anchor's events,
 *   particularly the event type and the ID of the related resource.
 * - This modeling is crucial for the webhook handler to correctly interpret and
 *   route different types of notifications.
 */
package domain

import "time"

// AnchorWebhookEvent represents the top-level structure of a webhook payload from Anchor.
type AnchorWebhookEvent struct {
	Event     string        `json:"event"` // e.g., "customer.identification.approved"
	Data      EventResource `json:"data"`
	CreatedAt time.Time     `json:"created_at"`
}

// EventResource represents the `data` object within the webhook payload,
// which contains information about the resource that the event pertains to.
type EventResource struct {
	ID            string                 `json:"id"`   // The ID of the resource (e.g., the customer ID).
	Type          string                 `json:"type"` // The type of the resource (e.g., "IndividualCustomer").
	Attributes    map[string]interface{} `json:"attributes,omitempty"`
	Relationships map[string]interface{} `json:"relationships,omitempty"`
}

// CustomerVerifiedEvent is the internal event payload published to RabbitMQ
// when a customer's KYC has been successfully approved.
type CustomerVerifiedEvent struct {
	AnchorCustomerID string `json:"anchor_customer_id"`
}

type CustomerTierStatusEvent struct {
    AnchorCustomerID string `json:"anchor_customer_id"`
    Status           string `json:"status"`
    Reason           string `json:"reason,omitempty"`
}
