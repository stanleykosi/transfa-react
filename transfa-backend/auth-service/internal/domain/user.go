package domain

import "time"

// UserType defines the type of a user account.
type UserType string

const (
	PersonalUser UserType = "personal"
	MerchantUser UserType = "merchant"
)

// User represents the core user model in our system.
type User struct {
	ID                string    `json:"id"`
	ClerkUserID       string    `json:"clerk_user_id"`
	AnchorCustomerID  *string   `json:"anchor_customer_id,omitempty"` // Pointer to handle null
	Username          string    `json:"username"`
	Email             *string   `json:"email,omitempty"`
	PhoneNumber       *string   `json:"phone_number,omitempty"`
	FullName          *string   `json:"full_name,omitempty"`
	ProfilePictureURL *string   `json:"profile_picture_url,omitempty"`
	Type              UserType  `json:"user_type"`
	AllowSending      bool      `json:"allow_sending"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// OnboardingRequest represents the data received from the client during the onboarding process.
type OnboardingRequest struct {
	Username    string                 `json:"username"`
	UserType    UserType               `json:"user_type"`
	KYCData     map[string]interface{} `json:"kyc_data"`
	Email       string                 `json:"email"`
	PhoneNumber string                 `json:"phone_number"`
}

// UserCreatedEvent represents the payload published to RabbitMQ after a user is created.
type UserCreatedEvent struct {
	UserID  string                 `json:"user_id"` // Our internal UUID
	KYCData map[string]interface{} `json:"kyc_data"`
}
