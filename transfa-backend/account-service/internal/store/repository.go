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

	"github.com/transfa/account-service/internal/domain"
)

// AccountRepository defines the contract for database operations related to accounts and users.
type AccountRepository interface {
	CreateAccount(ctx context.Context, account *domain.Account) (string, error)
	FindUserIDByAnchorCustomerID(ctx context.Context, anchorID string) (string, error)
	FindAccountByUserID(ctx context.Context, userID string) (*domain.Account, error)
	UpdateTierStatus(ctx context.Context, userID, stage, status string, reason *string) error
}

// BeneficiaryRepository defines the contract for database operations related to beneficiaries.
type BeneficiaryRepository interface {
	CreateBeneficiary(ctx context.Context, beneficiary *domain.Beneficiary) (*domain.Beneficiary, error)
	GetBeneficiariesByUserID(ctx context.Context, userID string) ([]domain.Beneficiary, error)
	DeleteBeneficiary(ctx context.Context, beneficiaryID string, userID string) error
	CountBeneficiariesByUserID(ctx context.Context, userID string) (int, error)
	GetUserSubscriptionStatus(ctx context.Context, userID string) (domain.SubscriptionStatus, error)
}

// BankRepository defines the contract for caching bank information.
type BankRepository interface {
    CacheBanks(ctx context.Context, banks []domain.Bank) error
    GetCachedBanks(ctx context.Context) ([]domain.Bank, error)
}
