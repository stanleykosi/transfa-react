/**
 * @description
 * This file defines the interfaces for the data access layer (repositories).
 * Defining interfaces allows for dependency injection and easy mocking in tests,
 * promoting a loosely coupled architecture.
 *
 * @notes
 * - Any component that needs to interact with the database should depend on these
 *   interfaces, not on the concrete PostgreSQL implementation.
 */
package store

import (
	"context"
	"time"

	"github.com/transfa/account-service/internal/domain"
)

// AccountRepository defines the contract for database operations related to accounts and users.
type AccountRepository interface {
	CreateAccount(ctx context.Context, account *domain.Account) (string, error)
	UpdateAccount(ctx context.Context, accountID string, anchorAccountID, virtualNUBAN, bankName string) error
	FindUserIDByAnchorCustomerID(ctx context.Context, anchorID string) (string, error)
	FindUserIDByClerkUserID(ctx context.Context, clerkUserID string) (string, error)
	GetUserSecurityCredentialByUserID(ctx context.Context, userID string) (*domain.UserSecurityCredential, error)
	RecordFailedTransactionPINAttempt(ctx context.Context, userID string, maxAttempts int, lockoutDurationSeconds int) (*domain.UserSecurityCredential, error)
	ResetTransactionPINFailureState(ctx context.Context, userID string) error
	FindAccountByUserID(ctx context.Context, userID string) (*domain.Account, error)
	UpdateTierStatus(ctx context.Context, userID, stage, status string, reason *string) error
	FindAnchorCustomerIDByUserID(ctx context.Context, userID string) (string, error)
	FindMoneyDropAccountByUserID(ctx context.Context, userID string) (*domain.Account, error)
}

// BeneficiaryRepository defines the contract for database operations related to beneficiaries.
type BeneficiaryRepository interface {
	CreateBeneficiary(ctx context.Context, beneficiary *domain.Beneficiary) (*domain.Beneficiary, error)
	GetBeneficiariesByUserID(ctx context.Context, userID string) ([]domain.Beneficiary, error)
	DeleteBeneficiary(ctx context.Context, beneficiaryID string, userID string) error
	CountBeneficiariesByUserID(ctx context.Context, userID string) (int, error)
}

// BankRepository defines the contract for caching bank information.
type BankRepository interface {
	CacheBanks(ctx context.Context, banks []domain.Bank) error
	GetCachedBanks(ctx context.Context) ([]domain.Bank, error)
	ClearExpiredBanks(ctx context.Context) error
	GetCacheExpiryTime(ctx context.Context) (time.Time, error)
	IsCacheExpiringSoon(ctx context.Context, duration time.Duration) (bool, error)
}
