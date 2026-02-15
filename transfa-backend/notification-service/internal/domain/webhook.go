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

import (
	"encoding/json"
	"time"
)

// AnchorWebhookEvent represents the top-level structure of a webhook payload from Anchor.
type AnchorWebhookEvent struct {
	Event     string          `json:"event"` // e.g., "customer.identification.approved"
	Data      EventResource   `json:"data"`
	Included  []EventResource `json:"included,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
}

// EventResource represents the `data` object within the webhook payload,
// which contains information about the resource that the event pertains to.
type EventResource struct {
	ID            string                  `json:"id"`   // The ID of the resource (e.g., the customer ID).
	Type          string                  `json:"type"` // The type of the resource (e.g., "IndividualCustomer").
	Attributes    map[string]interface{}  `json:"attributes,omitempty"`
	Relationships map[string]Relationship `json:"relationships,omitempty"`
}

// Relationship captures the nested objects within the `relationships` field.
type Relationship struct {
	Data json.RawMessage `json:"data,omitempty"`
}

// RelationshipData represents the data node inside a relationship.
type RelationshipData struct {
	ID   string `json:"id"`
	Type string `json:"type"`
}

// CustomerVerifiedEvent is the internal event payload published to RabbitMQ
// when a customer's KYC has been successfully approved.
type CustomerVerifiedEvent struct {
	AnchorCustomerID string `json:"anchor_customer_id"`
}

type CustomerTierStatusEvent struct {
	AnchorCustomerID string  `json:"anchor_customer_id"`
	Stage            string  `json:"stage,omitempty"`
	Status           string  `json:"status"`
	Reason           *string `json:"reason,omitempty"`
}

// AccountLifecycleEvent represents account-related events from Anchor.
type AccountLifecycleEvent struct {
	AnchorCustomerID string `json:"anchor_customer_id"`
	EventType        string `json:"event_type"`
	ResourceID       string `json:"resource_id"`
}
