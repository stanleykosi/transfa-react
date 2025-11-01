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
	TransferType             string     `json:"transfer_type"`
	FailureReason            *string    `json:"failure_reason,omitempty"`
	AnchorSessionID          *string    `json:"anchor_session_id,omitempty"`
	AnchorReason             *string    `json:"anchor_reason,omitempty"`
	SenderID                 uuid.UUID  `json:"sender_id"`
	RecipientID              *uuid.UUID `json:"recipient_id,omitempty"`
	SourceAccountID          uuid.UUID  `json:"source_account_id"`
	DestinationAccountID     *uuid.UUID `json:"destination_account_id,omitempty"`
	DestinationBeneficiaryID *uuid.UUID `json:"destination_beneficiary_id,omitempty"`
	Type                     string     `json:"type"`     // e.g., 'p2p', 'self_transfer'
	Category                 string     `json:"category"` // e.g., 'p2p_transfer', 'self_transfer'
	Status                   string     `json:"status"`   // e.g., 'pending', 'completed', 'failed'
	Amount                   int64      `json:"amount"`   // in kobo
	Fee                      int64      `json:"fee"`      // in kobo
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

// MoneyDrop represents the state of a money drop in the database.
type MoneyDrop struct {
	ID                   uuid.UUID `json:"id" db:"id"`
	CreatorID            uuid.UUID `json:"creator_id" db:"creator_id"`
	Status               string    `json:"status" db:"status"`
	AmountPerClaim       int64     `json:"amount_per_claim" db:"amount_per_claim"`
	TotalClaimsAllowed   int       `json:"total_claims_allowed" db:"total_claims_allowed"`
	ClaimsMadeCount      int       `json:"claims_made_count" db:"claims_made_count"`
	ExpiryTimestamp      time.Time `json:"expiry_timestamp" db:"expiry_timestamp"`
	FundingSourceAccountID uuid.UUID `json:"funding_source_account_id" db:"funding_source_account_id"`
	MoneyDropAccountID   uuid.UUID `json:"money_drop_account_id" db:"money_drop_account_id"`
	CreatedAt            time.Time `json:"created_at" db:"created_at"`
}

// MoneyDropClaim represents a single claim made against a money drop.
type MoneyDropClaim struct {
	ID         uuid.UUID `json:"id" db:"id"`
	DropID     uuid.UUID `json:"drop_id" db:"drop_id"`
	ClaimantID uuid.UUID `json:"claimant_id" db:"claimant_id"`
	ClaimedAt  time.Time `json:"claimed_at" db:"claimed_at"`
}

// CreateMoneyDropRequest defines the payload for creating a new money drop.
type CreateMoneyDropRequest struct {
	AmountPerClaim   int64 `json:"amount_per_claim" binding:"required,gt=0"`
	NumberOfPeople   int   `json:"number_of_people" binding:"required,gt=0"`
	ExpiryInMinutes  int   `json:"expiry_in_minutes" binding:"required,gt=0"`
}

// CreateMoneyDropResponse is the successful response after creating a money drop.
type CreateMoneyDropResponse struct {
	MoneyDropID      string    `json:"money_drop_id"`
	QRCodeContent    string    `json:"qr_code_content"`
	ShareableLink    string    `json:"shareable_link"`
	TotalAmount      int64     `json:"total_amount"`
	AmountPerClaim   int64     `json:"amount_per_claim"`
	NumberOfPeople   int       `json:"number_of_people"`
	Fee               int64     `json:"fee"` // Fee charged for creating the money drop
	ExpiryTimestamp  time.Time `json:"expiry_timestamp"`
}

// ClaimMoneyDropResponse is the successful response after claiming a money drop.
type ClaimMoneyDropResponse struct {
	Message         string `json:"message"`
	AmountClaimed   int64  `json:"amount_claimed"`
	CreatorUsername string `json:"creator_username"`
}

// MoneyDropDetails represents the details of a money drop for display.
type MoneyDropDetails struct {
	ID              uuid.UUID `json:"id"`
	CreatorUsername string    `json:"creator_username"`
	AmountPerClaim  int64     `json:"amount_per_claim"`
	Status          string    `json:"status"`
	IsClaimable     bool      `json:"is_claimable"`
	Message         string    `json:"message"`
}
