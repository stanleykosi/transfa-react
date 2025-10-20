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
	"time"

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
	FindAccountByUserID(ctx context.Context, userID uuid.UUID) (*domain.Account, error)
	FindBeneficiaryByID(ctx context.Context, beneficiaryID uuid.UUID, userID uuid.UUID) (*domain.Beneficiary, error)
	FindBeneficiariesByUserID(ctx context.Context, userID uuid.UUID) ([]domain.Beneficiary, error)
	FindDefaultBeneficiaryByUserID(ctx context.Context, userID uuid.UUID) (*domain.Beneficiary, error)
	FindOrCreateDefaultBeneficiary(ctx context.Context, userID uuid.UUID) (*domain.Beneficiary, error)
	SetDefaultBeneficiary(ctx context.Context, userID uuid.UUID, beneficiaryID uuid.UUID) error

	// Receiving preference methods
	FindOrCreateReceivingPreference(ctx context.Context, userID uuid.UUID) (*domain.UserReceivingPreference, error)
	UpdateReceivingPreference(ctx context.Context, userID uuid.UUID, useExternal bool, beneficiaryID *uuid.UUID) error

	// Subscription and Usage methods
	FindSubscriptionByUserID(ctx context.Context, userID uuid.UUID) (*domain.Subscription, error)
	FindOrCreateMonthlyUsage(ctx context.Context, userID uuid.UUID, period time.Time) (*domain.MonthlyUsage, error)
	IncrementMonthlyUsage(ctx context.Context, userID uuid.UUID, period time.Time) error

	// Transaction methods
	CreateTransaction(ctx context.Context, tx *domain.Transaction) error
	UpdateTransactionStatus(ctx context.Context, transactionID uuid.UUID, anchorTransferID, status string) error
	UpdateTransactionStatusAndFee(ctx context.Context, transactionID uuid.UUID, anchorTransferID, status string, fee int64) error
	DebitWallet(ctx context.Context, userID uuid.UUID, amount int64) error
	CreditWallet(ctx context.Context, userID uuid.UUID, amount int64) error

	// Payment Request methods
	CreatePaymentRequest(ctx context.Context, req *domain.PaymentRequest) (*domain.PaymentRequest, error)
	ListPaymentRequestsByCreator(ctx context.Context, creatorID uuid.UUID) ([]domain.PaymentRequest, error)
	GetPaymentRequestByID(ctx context.Context, requestID uuid.UUID) (*domain.PaymentRequest, error)
}
