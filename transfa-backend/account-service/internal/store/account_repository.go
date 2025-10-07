/**
 * @description
 * This file implements the data access layer for account-related operations.
 * It provides a clean interface for the application logic to interact with the
 * `accounts` table in the database.
 *
 * @dependencies
 * - context: For managing request-scoped deadlines and cancellations.
 * - log: For logging database errors.
 * - github.com/jackc/pgx/v5/pgxpool: The PostgreSQL driver.
 * - The service's internal domain package for the Account model.
 */
package store

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/transfa/account-service/internal/domain"
)


// PostgresAccountRepository is the PostgreSQL implementation of the AccountRepository.
type PostgresAccountRepository struct {
	db *pgxpool.Pool
}

// NewPostgresAccountRepository creates a new instance of PostgresAccountRepository.
func NewPostgresAccountRepository(db *pgxpool.Pool) *PostgresAccountRepository {
	return &PostgresAccountRepository{db: db}
}

// FindUserIDByAnchorCustomerID retrieves the internal user ID based on the Anchor Customer ID.
// This is necessary to link the new account back to the correct user.
func (r *PostgresAccountRepository) FindUserIDByAnchorCustomerID(ctx context.Context, anchorCustomerID string) (string, error) {
	query := `SELECT id FROM users WHERE anchor_customer_id = $1`
	var userID string
	err := r.db.QueryRow(ctx, query, anchorCustomerID).Scan(&userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			log.Printf("No user found with anchor_customer_id: %s", anchorCustomerID)
			return "", err // Let the caller handle not found
		}
		log.Printf("Error finding user by anchor_customer_id: %v", err)
		return "", err
	}
	return userID, nil
}

// FindAccountByUserID retrieves an account by user ID.
func (r *PostgresAccountRepository) FindAccountByUserID(ctx context.Context, userID string) (*domain.Account, error) {
	query := `
		SELECT id, user_id, anchor_account_id, virtual_nuban, bank_name, account_type, balance, status, created_at, updated_at
		FROM accounts 
		WHERE user_id = $1 
		ORDER BY created_at DESC 
		LIMIT 1
	`
	
	var account domain.Account
	err := r.db.QueryRow(ctx, query, userID).Scan(
		&account.ID,
		&account.UserID,
		&account.AnchorAccountID,
		&account.VirtualNUBAN,
		&account.BankName,
		&account.Type,
		&account.Balance,
		&account.Status,
		&account.CreatedAt,
		&account.UpdatedAt,
	)
	
	if err != nil {
		return nil, err
	}
	
	return &account, nil
}

// CreateAccount inserts a new account record into the database.
func (r *PostgresAccountRepository) CreateAccount(ctx context.Context, account *domain.Account) (string, error) {
	query := `
        INSERT INTO accounts (user_id, anchor_account_id, virtual_nuban, bank_name, account_type)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
    `
	var accountID string
	err := r.db.QueryRow(ctx, query,
		account.UserID,
		account.AnchorAccountID,
		account.VirtualNUBAN,
		account.BankName,
		account.Type,
	).Scan(&accountID)

	if err != nil {
		if pgErr, ok := err.(*pgconn.PgError); ok && pgErr.Code == "23505" { // unique_violation
			log.Printf("Error creating account: unique constraint violation on %s", pgErr.ConstraintName)
			return "", err
		}
		log.Printf("Error inserting account into database: %v", err)
		return "", err
	}

	log.Printf("Successfully created account with ID: %s", accountID)
	return accountID, nil
}

func (r *PostgresAccountRepository) UpdateTierStatus(ctx context.Context, userID, stage, status string, reason *string) error {
	query := `
		INSERT INTO onboarding_status (user_id, stage, status, reason)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, stage)
		DO UPDATE SET status = EXCLUDED.status, reason = EXCLUDED.reason, updated_at = NOW()
	`
	_, err := r.db.Exec(ctx, query, userID, stage, status, reason)
	if err != nil {
		log.Printf("Error updating tier status for user %s in account service: %v", userID, err)
		return err
	}
	return nil
}

// CreateBeneficiary inserts a new beneficiary record into the database.
func (r *PostgresAccountRepository) CreateBeneficiary(ctx context.Context, beneficiary *domain.Beneficiary) (*domain.Beneficiary, error) {
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
func (r *PostgresAccountRepository) GetBeneficiariesByUserID(ctx context.Context, userID string) ([]domain.Beneficiary, error) {
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
func (r *PostgresAccountRepository) DeleteBeneficiary(ctx context.Context, beneficiaryID string, userID string) error {
	query := `DELETE FROM beneficiaries WHERE id = $1 AND user_id = $2`
	cmdTag, err := r.db.Exec(ctx, query, beneficiaryID, userID)
	if err != nil {
		return fmt.Errorf("failed to delete beneficiary: %w", err)
	}
	if cmdTag.RowsAffected() == 0 {
		return fmt.Errorf("beneficiary not found or not owned by user")
	}
	return nil
}

// CountBeneficiariesByUserID counts the number of beneficiaries for a user.
func (r *PostgresAccountRepository) CountBeneficiariesByUserID(ctx context.Context, userID string) (int, error) {
	var count int
	query := `SELECT count(*) FROM beneficiaries WHERE user_id = $1`
	err := r.db.QueryRow(ctx, query, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count beneficiaries: %w", err)
	}
	return count, nil
}

// GetUserSubscriptionStatus retrieves the subscription status for a user.
func (r *PostgresAccountRepository) GetUserSubscriptionStatus(ctx context.Context, userID string) (domain.SubscriptionStatus, error) {
	var status string
	query := `SELECT status FROM subscriptions WHERE user_id = $1`
	err := r.db.QueryRow(ctx, query, userID).Scan(&status)
	if err != nil {
		if err == pgx.ErrNoRows {
			// If no record exists, the user is on the free tier (inactive subscription)
			return domain.SubscriptionStatusInactive, nil
		}
		return "", fmt.Errorf("failed to get user subscription status: %w", err)
	}
	return domain.SubscriptionStatus(status), nil
}
