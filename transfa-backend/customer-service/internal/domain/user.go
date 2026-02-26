/**
 * @description
 * This file defines the domain models related to user events that are shared
 * across different microservices.
 *
 * @dependencies
 * - None. These are plain Go structs.
 *
 * @notes
 * - The structures defined here, particularly `UserCreatedEvent`, act as a contract
 *   for messages passed through RabbitMQ. It's crucial that the producer (auth-service)
 *   and consumer (customer-service) agree on this structure.
 */
package domain

// UserType defines the type of a user account.
type UserType string

const (
	PersonalUser UserType = "personal"
	MerchantUser UserType = "merchant"
)

// UserCreatedEvent represents the payload published to RabbitMQ after a user is created in the auth-service.
// This is the message that the customer-service will consume.
type UserCreatedEvent struct {
	UserID  string                 `json:"user_id"`
	KYCData map[string]interface{} `json:"kyc_data"`
}

// Tier2VerificationRequestedEvent is emitted by the auth-service when the user submits Tier2 details.
type Tier2VerificationRequestedEvent struct {
	UserID           string `json:"user_id"`
	AnchorCustomerID string `json:"anchor_customer_id"`
	BVN              string `json:"bvn"`
	DateOfBirth      string `json:"date_of_birth"`
	Gender           string `json:"gender"`
}

type Tier3VerificationRequestedEvent struct {
	UserID           string `json:"user_id"`
	AnchorCustomerID string `json:"anchor_customer_id"`
	IDType           string `json:"id_type"`
	IDNumber         string `json:"id_number"`
	ExpiryDate       string `json:"expiry_date"`
}

type Tier1ProfileUpdateRequestedEvent struct {
	UserID           string                 `json:"user_id"`
	AnchorCustomerID string                 `json:"anchor_customer_id"`
	KYCData          map[string]interface{} `json:"kyc_data"`
}
