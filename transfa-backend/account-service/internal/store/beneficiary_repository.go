/**
 * @description
 * This file implements the data access layer for beneficiary-related operations.
 * It provides database operations for managing beneficiaries (external bank accounts).
 *
 * @dependencies
 * - context: For managing request-scoped deadlines and cancellations.
 * - log: For logging database errors.
 * - github.com/jackc/pgx/v5/pgxpool: The PostgreSQL driver.
 * - The service's internal domain package for the Beneficiary model.
 */
package store

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/transfa/account-service/internal/domain"
)

// PostgresBeneficiaryRepository is the PostgreSQL implementation of the BeneficiaryRepository.
type PostgresBeneficiaryRepository struct {
	db *pgxpool.Pool
}

// NewPostgresBeneficiaryRepository creates a new instance of PostgresBeneficiaryRepository.
func NewPostgresBeneficiaryRepository(db *pgxpool.Pool) *PostgresBeneficiaryRepository {
	return &PostgresBeneficiaryRepository{db: db}
}

// CreateBeneficiary inserts a new beneficiary record into the database.
func (r *PostgresBeneficiaryRepository) CreateBeneficiary(ctx context.Context, beneficiary *domain.Beneficiary) (*domain.Beneficiary, error) {
	query := `
        INSERT INTO beneficiaries (user_id, anchor_counterparty_id, account_name, account_number_masked, bank_name)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, created_at, updated_at
    `
	err := r.db.QueryRow(ctx, query,
		beneficiary.UserID,
		beneficiary.AnchorCounterpartyID,
		beneficiary.AccountName,
		beneficiary.AccountNumberMasked,
		beneficiary.BankName,
	).Scan(&beneficiary.ID, &beneficiary.CreatedAt, &beneficiary.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create beneficiary: %w", err)
	}
	return beneficiary, nil
}

// GetBeneficiariesByUserID retrieves all beneficiaries for a given user.
func (r *PostgresBeneficiaryRepository) GetBeneficiariesByUserID(ctx context.Context, userID string) ([]domain.Beneficiary, error) {
	var beneficiaries []domain.Beneficiary
	query := `
        SELECT id, user_id, anchor_counterparty_id, account_name, account_number_masked, bank_name, created_at, updated_at
        FROM beneficiaries
        WHERE user_id = $1
        ORDER BY created_at DESC
    `
	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query beneficiaries: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var b domain.Beneficiary
		err := rows.Scan(&b.ID, &b.UserID, &b.AnchorCounterpartyID, &b.AccountName, &b.AccountNumberMasked, &b.BankName, &b.CreatedAt, &b.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan beneficiary row: %w", err)
		}
		beneficiaries = append(beneficiaries, b)
	}

	return beneficiaries, nil
}

// DeleteBeneficiary removes a beneficiary record from the database.
func (r *PostgresBeneficiaryRepository) DeleteBeneficiary(ctx context.Context, beneficiaryID string, userID string) error {
	query := `
        DELETE FROM beneficiaries 
        WHERE id = $1 AND user_id = $2
    `
	result, err := r.db.Exec(ctx, query, beneficiaryID, userID)
	if err != nil {
		return fmt.Errorf("failed to delete beneficiary: %w", err)
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("beneficiary not found or not owned by user")
	}

	return nil
}

// CountBeneficiariesByUserID counts the number of beneficiaries for a given user.
func (r *PostgresBeneficiaryRepository) CountBeneficiariesByUserID(ctx context.Context, userID string) (int, error) {
	query := `SELECT COUNT(*) FROM beneficiaries WHERE user_id = $1`
	var count int
	err := r.db.QueryRow(ctx, query, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count beneficiaries: %w", err)
	}
	return count, nil
}

// GetUserSubscriptionStatus retrieves the subscription status for a user.
// For now, this returns a default status. In a real implementation, this would
// query a subscriptions table or external service.
func (r *PostgresBeneficiaryRepository) GetUserSubscriptionStatus(ctx context.Context, userID string) (domain.SubscriptionStatus, error) {
	// TODO: Implement actual subscription status lookup
	// For now, return inactive to enforce free tier limits
	return domain.SubscriptionStatusInactive, nil
}
