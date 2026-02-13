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
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
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
	// Check if this is the user's first beneficiary
	var existingCount int
	countQuery := `SELECT COUNT(*) FROM beneficiaries WHERE user_id = $1`
	err := r.db.QueryRow(ctx, countQuery, beneficiary.UserID).Scan(&existingCount)
	if err != nil {
		return nil, fmt.Errorf("failed to count existing beneficiaries: %w", err)
	}

	// If this is the first beneficiary, set it as default
	isDefault := existingCount == 0

	query := `
        INSERT INTO beneficiaries (user_id, anchor_counterparty_id, account_name, account_number_masked, bank_name, is_default)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, created_at, updated_at
    `
	err = r.db.QueryRow(ctx, query,
		beneficiary.UserID,
		beneficiary.AnchorCounterpartyID,
		beneficiary.AccountName,
		beneficiary.AccountNumberMasked,
		beneficiary.BankName,
		isDefault,
	).Scan(&beneficiary.ID, &beneficiary.CreatedAt, &beneficiary.UpdatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create beneficiary: %w", err)
	}

	// Set the is_default field in the returned object
	beneficiary.IsDefault = isDefault
	return beneficiary, nil
}

// GetBeneficiariesByUserID retrieves all beneficiaries for a given user.
func (r *PostgresBeneficiaryRepository) GetBeneficiariesByUserID(ctx context.Context, userID string) ([]domain.Beneficiary, error) {
	var beneficiaries []domain.Beneficiary
	query := `
        SELECT
            id,
            user_id,
            COALESCE(anchor_counterparty_id, '') AS anchor_counterparty_id,
            COALESCE(account_name, '') AS account_name,
            COALESCE(account_number_masked, '') AS account_number_masked,
            COALESCE(bank_name, '') AS bank_name,
            COALESCE(is_default, false) AS is_default,
            created_at,
            updated_at
        FROM beneficiaries
        WHERE user_id = $1
        ORDER BY COALESCE(is_default, false) DESC, created_at DESC
    `
	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		// Legacy compatibility: older schemas might not have is_default yet.
		if isUndefinedColumnError(err) {
			return r.getBeneficiariesByUserIDLegacy(ctx, userID)
		}
		return nil, fmt.Errorf("failed to query beneficiaries: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var b domain.Beneficiary
		err := rows.Scan(&b.ID, &b.UserID, &b.AnchorCounterpartyID, &b.AccountName, &b.AccountNumberMasked, &b.BankName, &b.IsDefault, &b.CreatedAt, &b.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan beneficiary row: %w", err)
		}
		beneficiaries = append(beneficiaries, b)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed while iterating beneficiary rows: %w", err)
	}

	return beneficiaries, nil
}

func (r *PostgresBeneficiaryRepository) getBeneficiariesByUserIDLegacy(ctx context.Context, userID string) ([]domain.Beneficiary, error) {
	var beneficiaries []domain.Beneficiary

	query := `
        SELECT
            id,
            user_id,
            COALESCE(anchor_counterparty_id, '') AS anchor_counterparty_id,
            COALESCE(account_name, '') AS account_name,
            COALESCE(account_number_masked, '') AS account_number_masked,
            COALESCE(bank_name, '') AS bank_name,
            created_at,
            updated_at
        FROM beneficiaries
        WHERE user_id = $1
        ORDER BY created_at DESC
    `

	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query beneficiaries (legacy schema): %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var b domain.Beneficiary
		err := rows.Scan(
			&b.ID,
			&b.UserID,
			&b.AnchorCounterpartyID,
			&b.AccountName,
			&b.AccountNumberMasked,
			&b.BankName,
			&b.CreatedAt,
			&b.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan beneficiary row (legacy schema): %w", err)
		}

		// Legacy schema has no default flag; treat as false.
		b.IsDefault = false
		beneficiaries = append(beneficiaries, b)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("failed while iterating beneficiary rows (legacy schema): %w", err)
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

func isUndefinedColumnError(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "42703"
	}
	return false
}
