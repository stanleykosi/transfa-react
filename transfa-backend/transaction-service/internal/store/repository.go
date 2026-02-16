/**
 * @description
 * This file defines the `Repository` interface, which specifies the contract for all
 * data access operations required by the transaction-service. By defining an interface,
 * we decouple the application's business logic from the specific database implementation
 * (e.g., PostgreSQL), making the code more modular and easier to test.
 *
 * @dependencies
 * - context, time: Standard Go libraries.
 * - github.com/google/uuid: For UUID generation and handling.
 * - internal/domain: For the service's domain models.
 */

package store

import (
	"context"

	"github.com/google/uuid"
	"github.com/transfa/transaction-service/internal/domain"
)

// Repository defines the set of methods for interacting with the database.
type Repository interface {
	// User and Account methods
	// Resolve internal UUID from Clerk user id (e.g., "user_abc123").
	FindUserIDByClerkUserID(ctx context.Context, clerkUserID string) (string, error)
	FindUserByUsername(ctx context.Context, username string) (*domain.User, error)
	FindUserByID(ctx context.Context, userID uuid.UUID) (*domain.User, error)
	GetUserSecurityCredentialByUserID(ctx context.Context, userID uuid.UUID) (*domain.UserSecurityCredential, error)
	RecordFailedTransactionPINAttempt(ctx context.Context, userID uuid.UUID, maxAttempts int, lockoutDurationSeconds int) (*domain.UserSecurityCredential, error)
	ResetTransactionPINFailureState(ctx context.Context, userID uuid.UUID) error
	FindAccountByUserID(ctx context.Context, userID uuid.UUID) (*domain.Account, error)
	UpdateAccountBalance(ctx context.Context, userID uuid.UUID, balance int64) error
	FindBeneficiaryByID(ctx context.Context, beneficiaryID uuid.UUID, userID uuid.UUID) (*domain.Beneficiary, error)
	FindBeneficiariesByUserID(ctx context.Context, userID uuid.UUID) ([]domain.Beneficiary, error)
	FindDefaultBeneficiaryByUserID(ctx context.Context, userID uuid.UUID) (*domain.Beneficiary, error)
	FindOrCreateDefaultBeneficiary(ctx context.Context, userID uuid.UUID) (*domain.Beneficiary, error)
	SetDefaultBeneficiary(ctx context.Context, userID uuid.UUID, beneficiaryID uuid.UUID) error

	// Receiving preference methods
	FindOrCreateReceivingPreference(ctx context.Context, userID uuid.UUID) (*domain.UserReceivingPreference, error)
	UpdateReceivingPreference(ctx context.Context, userID uuid.UUID, useExternal bool, beneficiaryID *uuid.UUID) error

	// Platform fee methods
	IsUserDelinquent(ctx context.Context, userID uuid.UUID) (bool, error)

	// Transaction methods
	CreateTransaction(ctx context.Context, tx *domain.Transaction) error
	UpdateTransactionStatus(ctx context.Context, transactionID uuid.UUID, anchorTransferID, status string) error
	UpdateTransactionStatusAndFee(ctx context.Context, transactionID uuid.UUID, anchorTransferID, status string, fee int64) error
	UpdateTransactionMetadata(ctx context.Context, transactionID uuid.UUID, metadata UpdateTransactionMetadataParams) error
	DebitWallet(ctx context.Context, userID uuid.UUID, amount int64) error
	CreditWallet(ctx context.Context, userID uuid.UUID, amount int64) error
	CreateTransferBatchWithItems(ctx context.Context, batch *domain.TransferBatch, items []domain.TransferBatchItem) error
	CreateTransferBatch(ctx context.Context, batch *domain.TransferBatch) error
	CreateTransferBatchItems(ctx context.Context, items []domain.TransferBatchItem) error
	MarkTransferBatchItemCompleted(ctx context.Context, itemID uuid.UUID, transactionID uuid.UUID, fee int64) error
	MarkTransferBatchItemFailed(ctx context.Context, itemID uuid.UUID, failureReason string) error
	FinalizeTransferBatch(ctx context.Context, batchID uuid.UUID) (*domain.TransferBatch, error)

	// Payment Request methods
	CreatePaymentRequest(ctx context.Context, req *domain.PaymentRequest) (*domain.PaymentRequest, error)
	ListPaymentRequestsByCreator(ctx context.Context, creatorID uuid.UUID, opts domain.PaymentRequestListOptions) ([]domain.PaymentRequest, error)
	GetPaymentRequestByID(ctx context.Context, requestID uuid.UUID, creatorID uuid.UUID) (*domain.PaymentRequest, error)
	DeletePaymentRequest(ctx context.Context, requestID uuid.UUID, creatorID uuid.UUID) (bool, error)

	// Transaction history methods
	FindTransactionsByUserID(ctx context.Context, userID uuid.UUID) ([]domain.Transaction, error)
	UpdateTransactionDestinations(ctx context.Context, transactionID uuid.UUID, destinationAccountID *uuid.UUID, destinationBeneficiaryID *uuid.UUID) error
	FindTransactionByID(ctx context.Context, transactionID uuid.UUID) (*domain.Transaction, error)
	FindTransactionByAnchorTransferID(ctx context.Context, anchorTransferID string) (*domain.Transaction, error)
	MarkTransactionAsFailed(ctx context.Context, transactionID uuid.UUID, anchorTransferID, failureReason string) error
	MarkTransactionAsCompleted(ctx context.Context, transactionID uuid.UUID, anchorTransferID string) error
	RefundTransactionFee(ctx context.Context, transactionID uuid.UUID, userID uuid.UUID, fee int64) error

	// Money Drop methods
	FindMoneyDropAccountByUserID(ctx context.Context, userID uuid.UUID) (*domain.Account, error)
	CreateAccount(ctx context.Context, account *domain.Account) (*domain.Account, error)
	CreateMoneyDrop(ctx context.Context, drop *domain.MoneyDrop) (*domain.MoneyDrop, error)
	FindMoneyDropByID(ctx context.Context, dropID uuid.UUID) (*domain.MoneyDrop, error)
	FindMoneyDropCreatorByDropID(ctx context.Context, dropID uuid.UUID) (*domain.User, error)
	ClaimMoneyDropAtomic(ctx context.Context, dropID, claimantID, claimantAccountID, moneyDropAccountID uuid.UUID, amount int64) error
	FindExpiredAndCompletedMoneyDrops(ctx context.Context) ([]domain.MoneyDrop, error)
	UpdateMoneyDropStatus(ctx context.Context, dropID uuid.UUID, status string) error
	UpdateMoneyDropAccountBalance(ctx context.Context, accountID uuid.UUID, balance int64) error
}

type UpdateTransactionMetadataParams struct {
	Status           *string
	AnchorTransferID *string
	TransferType     *string
	FailureReason    *string
	AnchorSessionID  *string
	AnchorReason     *string
}
