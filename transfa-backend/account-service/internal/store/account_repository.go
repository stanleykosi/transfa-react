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

// FindUserIDByClerkUserID retrieves the internal user ID based on the Clerk User ID.
// This is necessary to resolve Clerk User ID to internal UUID for beneficiary operations.
func (r *PostgresAccountRepository) FindUserIDByClerkUserID(ctx context.Context, clerkUserID string) (string, error) {
	query := `SELECT id FROM users WHERE clerk_user_id = $1`
	var userID string
	err := r.db.QueryRow(ctx, query, clerkUserID).Scan(&userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			log.Printf("No user found with clerk_user_id: %s", clerkUserID)
			return "", err // Let the caller handle not found
		}
		log.Printf("Error finding user by clerk_user_id: %v", err)
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

