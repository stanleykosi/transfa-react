/**
 * @description
 * This file defines the domain models for events that are consumed by the account-service.
 * These structs represent the contract for messages received from the message broker (RabbitMQ).
 *
 * @notes
 * - Having a clear, versioned contract for events is crucial for maintaining a
 *   stable and scalable microservices architecture.
 */
package domain

// CustomerVerifiedEvent is the payload received from RabbitMQ when a customer's
// KYC has been successfully approved and they are ready for an account to be provisioned.
type CustomerVerifiedEvent struct {
	AnchorCustomerID string `json:"anchor_customer_id"`
}

type CustomerTierStatusEvent struct {
	AnchorCustomerID string  `json:"anchor_customer_id"`
	Status           string  `json:"status"`
	Reason           *string `json:"reason,omitempty"`
}
