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
	TransactionPIN    string `json:"transaction_pin"`
}

// BulkP2PTransferRequest is the DTO for initiating multiple P2P transfers in one request.
type BulkP2PTransferRequest struct {
	Transfers      []BulkP2PTransferItem `json:"transfers"`
	TransactionPIN string                `json:"transaction_pin"`
}

// BulkP2PTransferItem represents one recipient transfer instruction within a bulk request.
type BulkP2PTransferItem struct {
	RecipientUsername string `json:"recipient_username"`
	Amount            int64  `json:"amount"` // in kobo
	Description       string `json:"description"`
}

// BulkP2PTransferFailure captures a failed transfer item and reason.
type BulkP2PTransferFailure struct {
	RecipientUsername string `json:"recipient_username"`
	Amount            int64  `json:"amount"`
	Description       string `json:"description"`
	Error             string `json:"error"`
}

// BulkP2PTransferResult summarizes successful and failed transfers for a batch.
type BulkP2PTransferResult struct {
	BatchID    uuid.UUID
	Successful []*Transaction
	Failed     []BulkP2PTransferFailure
}

// TransferBatch captures aggregate processing state for a bulk transfer request.
type TransferBatch struct {
	ID             uuid.UUID `json:"id"`
	SenderID       uuid.UUID `json:"sender_id"`
	Status         string    `json:"status"`
	RequestedCount int       `json:"requested_count"`
	SuccessCount   int       `json:"success_count"`
	FailureCount   int       `json:"failure_count"`
	TotalAmount    int64     `json:"total_amount"`
	TotalFee       int64     `json:"total_fee"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// TransferBatchItem captures processing state for one recipient within a batch.
type TransferBatchItem struct {
	ID                uuid.UUID  `json:"id"`
	BatchID           uuid.UUID  `json:"batch_id"`
	RecipientUsername string     `json:"recipient_username"`
	Amount            int64      `json:"amount"`
	Description       string     `json:"description"`
	Status            string     `json:"status"`
	Fee               int64      `json:"fee"`
	TransactionID     *uuid.UUID `json:"transaction_id,omitempty"`
	FailureReason     *string    `json:"failure_reason,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// SelfTransferRequest is the DTO for incoming self-transfer (withdrawal) API requests.
type SelfTransferRequest struct {
	BeneficiaryID  uuid.UUID `json:"beneficiary_id"`
	Amount         int64     `json:"amount"` // in kobo
	Description    string    `json:"description"`
	TransactionPIN string    `json:"transaction_pin"`
}

// User represents a simplified view of a user, containing only the data
// needed by the transaction-service.
type User struct {
	ID               uuid.UUID `json:"id"`
	Username         string    `json:"username"`
	FullName         *string   `json:"full_name,omitempty"`
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

type TransferListMember struct {
	UserID    uuid.UUID `json:"user_id"`
	Username  string    `json:"username"`
	FullName  *string   `json:"full_name,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type TransferList struct {
	ID          uuid.UUID            `json:"id"`
	OwnerID     uuid.UUID            `json:"owner_id"`
	Name        string               `json:"name"`
	MemberCount int                  `json:"member_count"`
	Members     []TransferListMember `json:"members"`
	CreatedAt   time.Time            `json:"created_at"`
	UpdatedAt   time.Time            `json:"updated_at"`
}

type TransferListSummary struct {
	ID              uuid.UUID `json:"id"`
	OwnerID         uuid.UUID `json:"owner_id"`
	Name            string    `json:"name"`
	MemberCount     int       `json:"member_count"`
	MemberUsernames []string  `json:"member_usernames"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type TransferListListOptions struct {
	Limit  int
	Offset int
	Search string
}

type CreateTransferListPayload struct {
	Name            string   `json:"name"`
	MemberUsernames []string `json:"member_usernames"`
}

type UpdateTransferListPayload struct {
	Name            string   `json:"name"`
	MemberUsernames []string `json:"member_usernames"`
}

type ToggleTransferListMemberPayload struct {
	Username string `json:"username"`
}

type ToggleTransferListMemberResult struct {
	List     *TransferList       `json:"list"`
	Member   *TransferListMember `json:"member,omitempty"`
	InList   bool                `json:"in_list"`
	Added    bool                `json:"added"`
	Removed  bool                `json:"removed"`
	Username string              `json:"username"`
}

// PaymentRequest represents a payment request record in the database.
// It aligns with the `payment_requests` table schema.
type PaymentRequest struct {
	ID                uuid.UUID  `json:"id" db:"id"`
	CreatorID         uuid.UUID  `json:"creator_id" db:"creator_id"`
	CreatorUsername   *string    `json:"creator_username,omitempty" db:"creator_username"`
	CreatorFullName   *string    `json:"creator_full_name,omitempty" db:"creator_full_name"`
	Status            string     `json:"status" db:"status"`
	DisplayStatus     string     `json:"display_status,omitempty"`
	RequestType       string     `json:"request_type" db:"request_type"`
	Title             string     `json:"title" db:"title"`
	RecipientUserID   *uuid.UUID `json:"recipient_user_id,omitempty" db:"recipient_user_id"`
	RecipientUsername *string    `json:"recipient_username,omitempty" db:"recipient_username"`
	RecipientFullName *string    `json:"recipient_full_name,omitempty" db:"recipient_full_name"`
	Amount            int64      `json:"amount" db:"amount"`
	Description       *string    `json:"description,omitempty" db:"description"`
	ImageURL          *string    `json:"image_url,omitempty" db:"image_url"`
	FulfilledByUserID *uuid.UUID `json:"fulfilled_by_user_id,omitempty" db:"fulfilled_by_user_id"`
	SettledTxID       *uuid.UUID `json:"settled_transaction_id,omitempty" db:"settled_transaction_id"`
	ProcessingStarted *time.Time `json:"processing_started_at,omitempty" db:"processing_started_at"`
	RespondedAt       *time.Time `json:"responded_at,omitempty" db:"responded_at"`
	DeclinedReason    *string    `json:"declined_reason,omitempty" db:"declined_reason"`
	ShareableLink     string     `json:"shareable_link,omitempty"`
	QRCodeContent     string     `json:"qr_code_content,omitempty"`
	DeletedAt         *time.Time `json:"-" db:"deleted_at"`
	CreatedAt         time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at" db:"updated_at"`
}

// CreatePaymentRequestPayload defines the structure for creating a new payment request.
type CreatePaymentRequestPayload struct {
	RequestType       string  `json:"request_type"`
	Title             string  `json:"title"`
	RecipientUsername *string `json:"recipient_username,omitempty"`
	Amount            int64   `json:"amount" validate:"required,gt=0"`
	Description       *string `json:"description,omitempty"`
	ImageURL          *string `json:"image_url,omitempty"`
}

// PaymentRequestListOptions controls pagination and search for creator-owned requests.
type PaymentRequestListOptions struct {
	Limit  int
	Offset int
	Search string
	Status string
	Type   string
}

type PayIncomingPaymentRequestPayload struct {
	TransactionPIN string `json:"transaction_pin"`
}

type DeclineIncomingPaymentRequestPayload struct {
	Reason *string `json:"reason,omitempty"`
}

type PayIncomingPaymentRequestResult struct {
	Request     *PaymentRequest `json:"request"`
	Transaction *Transaction    `json:"transaction"`
}

type NotificationListOptions struct {
	Limit    int
	Offset   int
	Search   string
	Category string
	Status   string
}

type InAppNotification struct {
	ID                uuid.UUID              `json:"id"`
	UserID            uuid.UUID              `json:"user_id"`
	Category          string                 `json:"category"`
	Type              string                 `json:"type"`
	Title             string                 `json:"title"`
	Body              *string                `json:"body,omitempty"`
	Status            string                 `json:"status"`
	RelatedEntityType *string                `json:"related_entity_type,omitempty"`
	RelatedEntityID   *uuid.UUID             `json:"related_entity_id,omitempty"`
	Data              map[string]interface{} `json:"data,omitempty"`
	DedupeKey         *string                `json:"-"`
	ReadAt            *time.Time             `json:"read_at,omitempty"`
	CreatedAt         time.Time              `json:"created_at"`
	UpdatedAt         time.Time              `json:"updated_at"`
}

type NotificationUnreadCounts struct {
	Total      int64 `json:"total"`
	Request    int64 `json:"request"`
	Newsletter int64 `json:"newsletter"`
	System     int64 `json:"system"`
}

// MoneyDrop represents the state of a money drop in the database.
type MoneyDrop struct {
	ID                     uuid.UUID  `json:"id" db:"id"`
	CreatorID              uuid.UUID  `json:"creator_id" db:"creator_id"`
	Title                  string     `json:"title" db:"title"`
	Status                 string     `json:"status" db:"status"`
	TotalAmount            int64      `json:"total_amount" db:"total_amount"`
	RefundedAmount         int64      `json:"refunded_amount" db:"refunded_amount"`
	AmountPerClaim         int64      `json:"amount_per_claim" db:"amount_per_claim"`
	TotalClaimsAllowed     int        `json:"total_claims_allowed" db:"total_claims_allowed"`
	ClaimsMadeCount        int        `json:"claims_made_count" db:"claims_made_count"`
	ExpiryTimestamp        time.Time  `json:"expiry_timestamp" db:"expiry_timestamp"`
	LockEnabled            bool       `json:"lock_enabled" db:"lock_enabled"`
	LockPasswordHash       *string    `json:"-" db:"lock_password_hash"`
	LockPasswordEncrypted  *string    `json:"-" db:"lock_password_encrypted"`
	FeeAmount              int64      `json:"fee_amount" db:"fee_amount"`
	FeePercentage          float64    `json:"fee_percentage" db:"fee_percentage"`
	EndedAt                *time.Time `json:"ended_at,omitempty" db:"ended_at"`
	EndedReason            *string    `json:"ended_reason,omitempty" db:"ended_reason"`
	FundingSourceAccountID uuid.UUID  `json:"funding_source_account_id" db:"funding_source_account_id"`
	MoneyDropAccountID     uuid.UUID  `json:"money_drop_account_id" db:"money_drop_account_id"`
	CreatedAt              time.Time  `json:"created_at" db:"created_at"`
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
	Title           string `json:"title"`
	TotalAmount     int64  `json:"total_amount" binding:"required,gt=0"`
	NumberOfPeople  int    `json:"number_of_people" binding:"required,gt=0"`
	ExpiryInMinutes int    `json:"expiry_in_minutes" binding:"required,gt=0"`
	LockDrop        bool   `json:"lock_drop"`
	LockPassword    string `json:"lock_password"`
	TransactionPIN  string `json:"transaction_pin"`
}

// UserSecurityCredential stores server-owned transaction PIN security metadata.
type UserSecurityCredential struct {
	UserID             uuid.UUID  `json:"user_id"`
	TransactionPINHash string     `json:"-"`
	FailedAttempts     int        `json:"failed_attempts"`
	LockedUntil        *time.Time `json:"locked_until,omitempty"`
}

// CreateMoneyDropResponse is the successful response after creating a money drop.
type CreateMoneyDropResponse struct {
	MoneyDropID     string    `json:"money_drop_id"`
	Title           string    `json:"title"`
	QRCodeContent   string    `json:"qr_code_content"`
	ShareableLink   string    `json:"shareable_link"`
	TotalAmount     int64     `json:"total_amount"`
	AmountPerClaim  int64     `json:"amount_per_claim"`
	NumberOfPeople  int       `json:"number_of_people"`
	Fee             int64     `json:"fee"` // Fee charged for creating the money drop
	FeePercentage   float64   `json:"fee_percentage"`
	LockEnabled     bool      `json:"lock_enabled"`
	ExpiryTimestamp time.Time `json:"expiry_timestamp"`
}

// ClaimMoneyDropRequest defines claim payload. Lock password is required for password-protected drops.
type ClaimMoneyDropRequest struct {
	LockPassword string `json:"lock_password"`
}

// ClaimMoneyDropResponse is the successful response after claiming a money drop.
type ClaimMoneyDropResponse struct {
	Message         string `json:"message"`
	AmountClaimed   int64  `json:"amount_claimed"`
	CreatorUsername string `json:"creator_username"`
}

type RevealMoneyDropPasswordRequest struct {
	TransactionPIN string `json:"transaction_pin"`
}

type RevealMoneyDropPasswordResponse struct {
	LockPassword string `json:"lock_password"`
}

// MoneyDropDetails represents the details of a money drop for display.
type MoneyDropDetails struct {
	ID               uuid.UUID `json:"id"`
	Title            string    `json:"title"`
	CreatorUsername  string    `json:"creator_username"`
	TotalAmount      int64     `json:"total_amount"`
	AmountPerClaim   int64     `json:"amount_per_claim"`
	Status           string    `json:"status"`
	IsClaimable      bool      `json:"is_claimable"`
	RequiresPassword bool      `json:"requires_password"`
	Message          string    `json:"message"`
}

type MoneyDropDashboardItem struct {
	ID                 uuid.UUID `json:"id"`
	Title              string    `json:"title"`
	Status             string    `json:"status"`
	TotalAmount        int64     `json:"total_amount"`
	AmountPerPerson    int64     `json:"amount_per_person"`
	NumberOfPeople     int       `json:"number_of_people"`
	ClaimsMadeCount    int       `json:"claims_made_count"`
	TimeLeftLabel      string    `json:"time_left_label"`
	UsersClaimedLabel  string    `json:"users_claimed_label"`
	ExpiryTimestamp    time.Time `json:"expiry_timestamp"`
	CreatedDateLabel   string    `json:"created_date_label"`
	Ended              bool      `json:"ended"`
	EndedDisplayStatus string    `json:"ended_display_status"`
}

type MoneyDropDashboardResponse struct {
	CurrentBalance int64                    `json:"current_balance"`
	ActiveDrops    []MoneyDropDashboardItem `json:"active_drops"`
	DropHistory    []MoneyDropDashboardItem `json:"drop_history"`
}

type MoneyDropClaimer struct {
	UserID            uuid.UUID `json:"user_id"`
	Username          string    `json:"username"`
	FullName          *string   `json:"full_name,omitempty"`
	ProfilePictureURL *string   `json:"profile_picture_url,omitempty"`
	AmountClaimed     int64     `json:"amount_claimed"`
	ClaimedAt         time.Time `json:"claimed_at"`
}

type MoneyDropOwnerDetails struct {
	ID                 uuid.UUID          `json:"id"`
	Title              string             `json:"title"`
	Status             string             `json:"status"`
	StatusLabel        string             `json:"status_label"`
	TotalAmount        int64              `json:"total_amount"`
	AmountPerPerson    int64              `json:"amount_per_person"`
	NumberOfPeople     int                `json:"number_of_people"`
	ClaimsMadeCount    int                `json:"claims_made_count"`
	ExpiryTimestamp    time.Time          `json:"expiry_timestamp"`
	LockEnabled        bool               `json:"lock_enabled"`
	LockPasswordMasked string             `json:"lock_password_masked,omitempty"`
	LockPassword       *string            `json:"lock_password,omitempty"`
	ShareableLink      string             `json:"shareable_link"`
	QRCodeContent      string             `json:"qr_code_content"`
	Claimers           []MoneyDropClaimer `json:"claimers"`
	CanEndDrop         bool               `json:"can_end_drop"`
	EndedAt            *time.Time         `json:"ended_at,omitempty"`
	EndedReason        *string            `json:"ended_reason,omitempty"`
}

type MoneyDropClaimersResponse struct {
	DropID   uuid.UUID          `json:"drop_id"`
	Title    string             `json:"title"`
	Claimers []MoneyDropClaimer `json:"claimers"`
	Total    int                `json:"total"`
	HasMore  bool               `json:"has_more"`
}

type EndMoneyDropResponse struct {
	DropID           uuid.UUID `json:"drop_id"`
	Status           string    `json:"status"`
	RefundedAmount   int64     `json:"refunded_amount"`
	RemainingBalance int64     `json:"remaining_balance"`
	Message          string    `json:"message"`
}

type ClaimedMoneyDropHistoryItem struct {
	DropID          uuid.UUID `json:"drop_id"`
	Title           string    `json:"title"`
	CreatorUsername string    `json:"creator_username"`
	AmountClaimed   int64     `json:"amount_claimed"`
	ClaimedAt       time.Time `json:"claimed_at"`
}

type ClaimedMoneyDropHistoryResponse struct {
	Items []ClaimedMoneyDropHistoryItem `json:"items"`
}

// PendingMoneyDropClaimReconciliationCandidate describes a pending claim transaction
// that has no Anchor transfer ID and is eligible for reconciliation retry.
type PendingMoneyDropClaimReconciliationCandidate struct {
	TransactionID              uuid.UUID
	SourceAnchorAccountID      string
	DestinationAnchorAccountID string
	Amount                     int64
}

// MoneyDropClaimReconcileResponse summarizes an internal reconciliation run.
type MoneyDropClaimReconcileResponse struct {
	Processed             int `json:"processed"`
	Retried               int `json:"retried"`
	RetryFailed           int `json:"retry_failed"`
	ExplicitAnchorRejects int `json:"explicit_anchor_rejects"`
	AmbiguousFailures     int `json:"ambiguous_failures"`
}
