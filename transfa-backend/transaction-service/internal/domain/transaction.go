/**
 * @description
 * This file defines the core domain models for the transaction-service.
 * These structs represent the main entities and data transfer objects (DTOs)
 * used throughout the service's business logic, database interactions, and API layers.
 *
 * @notes
 * - Using distinct types for API requests, database models, and external service
 *   payloads ensures clear separation of concerns and type safety.
 * - Amounts are stored as `int64` to represent the value in the smallest currency
 *   unit (kobo), which avoids floating-point inaccuracies with financial data.
 */

package domain

import (
	"time"

	"github.com/google/uuid"
)

// Transaction represents the central ledger record for any money movement in the system.
// This struct maps directly to the `transactions` table in the database.
type Transaction struct {
	ID                       uuid.UUID  `json:"id"`
	AnchorTransferID         *string    `json:"anchor_transfer_id"`
	SenderID                 uuid.UUID  `json:"sender_id"`
	RecipientID              *uuid.UUID `json:"recipient_id,omitempty"`
	SourceAccountID          uuid.UUID  `json:"source_account_id"`
	DestinationAccountID     *uuid.UUID `json:"destination_account_id,omitempty"`
	DestinationBeneficiaryID *uuid.UUID `json:"destination_beneficiary_id,omitempty"`
	Type                     string     `json:"type"`   // e.g., 'p2p', 'self_transfer'
	Status                   string     `json:"status"` // e.g., 'pending', 'completed', 'failed'
	Amount                   int64      `json:"amount"` // in kobo
	Fee                      int64      `json:"fee"`    // in kobo
	Description              string     `json:"description"`
	CreatedAt                time.Time  `json:"created_at"`
	UpdatedAt                time.Time  `json:"updated_at"`
}

// P2PTransferRequest is the DTO for incoming peer-to-peer transfer API requests.
type P2PTransferRequest struct {
	RecipientUsername string `json:"recipient_username"`
	Amount            int64  `json:"amount"` // in kobo
	Description       string `json:"description"`
}

// SelfTransferRequest is the DTO for incoming self-transfer (withdrawal) API requests.
type SelfTransferRequest struct {
	BeneficiaryID uuid.UUID `json:"beneficiary_id"`
	Amount        int64     `json:"amount"` // in kobo
	Description   string    `json:"description"`
}

// User represents a simplified view of a user, containing only the data
// needed by the transaction-service.
type User struct {
	ID               uuid.UUID `json:"id"`
	Username         string    `json:"username"`
	AllowSending     bool      `json:"allow_sending"`
	AnchorCustomerID string    `json:"anchor_customer_id"`
}

// UserReceivingPreference represents a user's preference for receiving transfers.
type UserReceivingPreference struct {
	UserID               uuid.UUID  `json:"user_id"`
	UseExternalAccount   bool       `json:"use_external_account"` // true = use beneficiary, false = use internal wallet
	DefaultBeneficiaryID *uuid.UUID `json:"default_beneficiary_id,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
}

// Account represents a user's internal wallet.
type Account struct {
	ID              uuid.UUID `json:"id"`
	UserID          uuid.UUID `json:"user_id"`
	AnchorAccountID string    `json:"anchor_account_id"`
	Balance         int64     `json:"balance"` // in kobo
}

// Beneficiary represents a user's saved external bank account.
type Beneficiary struct {
	ID                   uuid.UUID `json:"id"`
	UserID               uuid.UUID `json:"user_id"`
	AnchorCounterpartyID string    `json:"anchor_counterparty_id"`
	AccountName          string    `json:"account_name"`
	AccountNumberMasked  string    `json:"account_number_masked"`
	BankName             string    `json:"bank_name"`
	IsDefault            bool      `json:"is_default"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
}

// Subscription holds the subscription status for a user.
type Subscription struct {
	UserID uuid.UUID `json:"user_id"`
	Status string    `json:"status"` // 'active', 'inactive', 'lapsed'
}

// MonthlyUsage tracks free transfers for non-subscribed users.
type MonthlyUsage struct {
	UserID               uuid.UUID `json:"user_id"`
	Period               time.Time `json:"period"`
	ExternalReceiptCount int       `json:"external_receipt_count"`
}

// ReroutedInternalPayload is the message payload published to RabbitMQ
// when a P2P transfer is rerouted to the recipient's internal wallet.
type ReroutedInternalPayload struct {
	RecipientID uuid.UUID `json:"recipient_id"`
	SenderID    uuid.UUID `json:"sender_id"`
	Amount      int64     `json:"amount"`
	Reason      string    `json:"reason"`
}

// AccountBalance represents the balance information for a user's account.
type AccountBalance struct {
	AvailableBalance int64 `json:"available_balance"` // in kobo
	LedgerBalance    int64 `json:"ledger_balance"`    // in kobo
	Hold             int64 `json:"hold"`              // in kobo
	Pending          int64 `json:"pending"`           // in kobo
}

// PaymentRequest represents a payment request record in the database.
// It aligns with the `payment_requests` table schema.
type PaymentRequest struct {
	ID          uuid.UUID `json:"id" db:"id"`
	CreatorID   uuid.UUID `json:"creator_id" db:"creator_id"`
	Status      string    `json:"status" db:"status"`
	Amount      int64     `json:"amount" db:"amount"`
	Description *string   `json:"description,omitempty" db:"description"`
	ImageURL    *string   `json:"image_url,omitempty" db:"image_url"`
	CreatedAt   time.Time `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time `json:"updated_at" db:"updated_at"`
}

// CreatePaymentRequestPayload defines the structure for creating a new payment request.
type CreatePaymentRequestPayload struct {
	Amount      int64   `json:"amount" validate:"required,gt=0"`
	Description *string `json:"description,omitempty"`
	ImageURL    *string `json:"image_url,omitempty"`
}
