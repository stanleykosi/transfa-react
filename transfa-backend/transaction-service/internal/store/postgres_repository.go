/**
 * @description
 * This file provides the PostgreSQL implementation of the `Repository` interface.
 * It contains all the necessary SQL queries to interact with the database tables
 * related to transactions, users, accounts, and subscriptions.
 *
 * @dependencies
 * - context, time, errors: Standard Go libraries.
 * - github.com/jackc/pgx/v5: The PostgreSQL driver for database operations.
 * - internal/domain: Contains the domain models used for data transfer.
 */

package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/transfa/transaction-service/internal/domain"
)

var (
	ErrUserNotFound         = errors.New("user not found")
	ErrAccountNotFound      = errors.New("account not found")
	ErrBeneficiaryNotFound  = errors.New("beneficiary not found")
	ErrSubscriptionNotFound = errors.New("subscription not found")
	ErrInsufficientFunds    = errors.New("insufficient funds")
)

// PostgresRepository is a concrete implementation of the Repository interface for PostgreSQL.
type PostgresRepository struct {
	db *pgxpool.Pool
}

// NewPostgresRepository creates a new instance of PostgresRepository.
func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

// FindUserIDByClerkUserID resolves the internal UUID from a Clerk user id.
// This mirrors the approach used in other services (e.g., account-service).
func (r *PostgresRepository) FindUserIDByClerkUserID(ctx context.Context, clerkUserID string) (string, error) {
	var id string
	// users table is expected to have a clerk_user_id column (managed by auth-service during onboarding)
	err := r.db.QueryRow(ctx, "SELECT id FROM users WHERE clerk_user_id = $1", clerkUserID).Scan(&id)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", ErrUserNotFound
		}
		return "", err
	}
	return id, nil
}

// FindUserByUsername retrieves a user from the database by their username.
func (r *PostgresRepository) FindUserByUsername(ctx context.Context, username string) (*domain.User, error) {
	var user domain.User
	query := `SELECT id, username, allow_sending, anchor_customer_id FROM users WHERE username = $1`
	err := r.db.QueryRow(ctx, query, username).Scan(&user.ID, &user.Username, &user.AllowSending, &user.AnchorCustomerID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &user, nil
}

// FindUserByID retrieves a user from the database by their ID.
func (r *PostgresRepository) FindUserByID(ctx context.Context, userID uuid.UUID) (*domain.User, error) {
	var user domain.User
	query := `SELECT id, username, allow_sending, anchor_customer_id FROM users WHERE id = $1`
	err := r.db.QueryRow(ctx, query, userID).Scan(&user.ID, &user.Username, &user.AllowSending, &user.AnchorCustomerID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &user, nil
}

// FindAccountByUserID retrieves a user's primary account from the database.
func (r *PostgresRepository) FindAccountByUserID(ctx context.Context, userID uuid.UUID) (*domain.Account, error) {
	var account domain.Account
	query := `SELECT id, user_id, anchor_account_id, balance FROM accounts WHERE user_id = $1 AND account_type = 'primary'`
	err := r.db.QueryRow(ctx, query, userID).Scan(&account.ID, &account.UserID, &account.AnchorAccountID, &account.Balance)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrAccountNotFound
		}
		return nil, err
	}
	return &account, nil
}

// UpdateAccountBalance updates the balance for a user's account
func (r *PostgresRepository) UpdateAccountBalance(ctx context.Context, userID uuid.UUID, balance int64) error {
	query := `UPDATE accounts SET balance = $1, updated_at = NOW() WHERE user_id = $2 AND account_type = 'primary'`
	result, err := r.db.Exec(ctx, query, balance, userID)
	if err != nil {
		return err
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected == 0 {
		return ErrAccountNotFound
	}

	return nil
}

// FindTransactionsByUserID retrieves all transactions for a user (as sender or recipient).
func (r *PostgresRepository) FindTransactionsByUserID(ctx context.Context, userID uuid.UUID) ([]domain.Transaction, error) {
	var transactions []domain.Transaction
	query := `
		SELECT id, anchor_transfer_id, sender_id, recipient_id, source_account_id, destination_account_id, 
		       destination_beneficiary_id, type, category, status, amount, fee, COALESCE(description, ''), created_at, updated_at
		FROM transactions 
		WHERE sender_id = $1 OR recipient_id = $1 
		ORDER BY created_at DESC
	`
	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var tx domain.Transaction
		err := rows.Scan(
			&tx.ID, &tx.AnchorTransferID, &tx.SenderID, &tx.RecipientID, &tx.SourceAccountID,
			&tx.DestinationAccountID, &tx.DestinationBeneficiaryID, &tx.Type, &tx.Category,
			&tx.Status, &tx.Amount, &tx.Fee, &tx.Description, &tx.CreatedAt, &tx.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		transactions = append(transactions, tx)
	}

	return transactions, nil
}

// FindBeneficiaryByID retrieves a specific beneficiary owned by a user.
func (r *PostgresRepository) FindBeneficiaryByID(ctx context.Context, beneficiaryID uuid.UUID, userID uuid.UUID) (*domain.Beneficiary, error) {
	var beneficiary domain.Beneficiary
	query := `SELECT id, user_id, anchor_counterparty_id, account_name, account_number_masked, bank_name, is_default, created_at, updated_at FROM beneficiaries WHERE id = $1 AND user_id = $2`
	err := r.db.QueryRow(ctx, query, beneficiaryID, userID).Scan(
		&beneficiary.ID, &beneficiary.UserID, &beneficiary.AnchorCounterpartyID,
		&beneficiary.AccountName, &beneficiary.AccountNumberMasked, &beneficiary.BankName,
		&beneficiary.IsDefault, &beneficiary.CreatedAt, &beneficiary.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrBeneficiaryNotFound
		}
		return nil, err
	}
	return &beneficiary, nil
}

// FindBeneficiariesByUserID retrieves all beneficiaries for a user.
func (r *PostgresRepository) FindBeneficiariesByUserID(ctx context.Context, userID uuid.UUID) ([]domain.Beneficiary, error) {
	var beneficiaries []domain.Beneficiary
	query := `
		SELECT id, user_id, anchor_counterparty_id, account_name, account_number_masked, bank_name, is_default, created_at, updated_at 
		FROM beneficiaries 
		WHERE user_id = $1 
		ORDER BY is_default DESC, created_at DESC
	`
	rows, err := r.db.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var beneficiary domain.Beneficiary
		err := rows.Scan(
			&beneficiary.ID, &beneficiary.UserID, &beneficiary.AnchorCounterpartyID,
			&beneficiary.AccountName, &beneficiary.AccountNumberMasked, &beneficiary.BankName,
			&beneficiary.IsDefault, &beneficiary.CreatedAt, &beneficiary.UpdatedAt)
		if err != nil {
			return nil, err
		}
		beneficiaries = append(beneficiaries, beneficiary)
	}

	return beneficiaries, nil
}

// FindDefaultBeneficiaryByUserID retrieves the default beneficiary for a user.
func (r *PostgresRepository) FindDefaultBeneficiaryByUserID(ctx context.Context, userID uuid.UUID) (*domain.Beneficiary, error) {
	var beneficiary domain.Beneficiary
	query := `
		SELECT id, user_id, anchor_counterparty_id, account_name, account_number_masked, bank_name, is_default, created_at, updated_at 
		FROM beneficiaries 
		WHERE user_id = $1 AND is_default = true
	`
	err := r.db.QueryRow(ctx, query, userID).Scan(
		&beneficiary.ID, &beneficiary.UserID, &beneficiary.AnchorCounterpartyID,
		&beneficiary.AccountName, &beneficiary.AccountNumberMasked, &beneficiary.BankName,
		&beneficiary.IsDefault, &beneficiary.CreatedAt, &beneficiary.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrBeneficiaryNotFound
		}
		return nil, err
	}
	return &beneficiary, nil
}

// FindSubscriptionByUserID retrieves a user's subscription status.
func (r *PostgresRepository) FindSubscriptionByUserID(ctx context.Context, userID uuid.UUID) (*domain.Subscription, error) {
	var sub domain.Subscription
	query := `SELECT user_id, status FROM subscriptions WHERE user_id = $1`
	err := r.db.QueryRow(ctx, query, userID).Scan(&sub.UserID, &sub.Status)
	if err != nil {
		if err == pgx.ErrNoRows {
			// If no subscription record exists, treat them as inactive.
			return &domain.Subscription{UserID: userID, Status: "inactive"}, nil
		}
		return nil, err
	}
	return &sub, nil
}

// FindOrCreateMonthlyUsage finds the current month's usage record for a user or creates a new one if it doesn't exist.
func (r *PostgresRepository) FindOrCreateMonthlyUsage(ctx context.Context, userID uuid.UUID, period time.Time) (*domain.MonthlyUsage, error) {
	var usage domain.MonthlyUsage
	// Use an `INSERT ... ON CONFLICT ... DO NOTHING` followed by a SELECT to ensure atomicity.
	insertQuery := `
		INSERT INTO monthly_transfer_usage (user_id, period, external_receipt_count)
		VALUES ($1, $2::DATE, 0)
		ON CONFLICT (user_id, period) DO NOTHING
	`
	_, err := r.db.Exec(ctx, insertQuery, userID, period)
	if err != nil {
		return nil, err
	}

	selectQuery := `SELECT user_id, period, external_receipt_count FROM monthly_transfer_usage WHERE user_id = $1 AND period = $2`
	err = r.db.QueryRow(ctx, selectQuery, userID, period).Scan(&usage.UserID, &usage.Period, &usage.ExternalReceiptCount)
	if err != nil {
		return nil, err
	}

	return &usage, nil
}

// IncrementMonthlyUsage increases the external transfer count for a user for the given period.
func (r *PostgresRepository) IncrementMonthlyUsage(ctx context.Context, userID uuid.UUID, period time.Time) error {
	query := `
		UPDATE monthly_transfer_usage
		SET external_receipt_count = external_receipt_count + 1
		WHERE user_id = $1 AND period = $2::DATE
	`
	_, err := r.db.Exec(ctx, query, userID, period)
	return err
}

// CreateTransaction inserts a new transaction record into the database.
func (r *PostgresRepository) CreateTransaction(ctx context.Context, tx *domain.Transaction) error {
	query := `
		INSERT INTO transactions (id, sender_id, recipient_id, source_account_id, destination_account_id, destination_beneficiary_id, type, category, status, amount, fee, description)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`
	_, err := r.db.Exec(ctx, query, tx.ID, tx.SenderID, tx.RecipientID, tx.SourceAccountID, tx.DestinationAccountID, tx.DestinationBeneficiaryID, tx.Type, tx.Category, tx.Status, tx.Amount, tx.Fee, tx.Description)
	return err
}

// UpdateTransactionStatus updates the status and Anchor transfer ID of an existing transaction.
func (r *PostgresRepository) UpdateTransactionStatus(ctx context.Context, transactionID uuid.UUID, anchorTransferID, status string) error {
	query := `UPDATE transactions SET status = $1, anchor_transfer_id = $2, updated_at = NOW() WHERE id = $3`
	_, err := r.db.Exec(ctx, query, status, anchorTransferID, transactionID)
	return err
}

// UpdateTransactionStatusAndFee updates status, Anchor ID, and the fee for a transaction.
func (r *PostgresRepository) UpdateTransactionStatusAndFee(ctx context.Context, transactionID uuid.UUID, anchorTransferID, status string, fee int64) error {
	query := `UPDATE transactions SET status = $1, anchor_transfer_id = $2, fee = $3, updated_at = NOW() WHERE id = $4`
	_, err := r.db.Exec(ctx, query, status, anchorTransferID, fee, transactionID)
	return err
}

// UpdateTransactionDestinations fills in destination account/beneficiary for a transaction.
func (r *PostgresRepository) UpdateTransactionDestinations(ctx context.Context, transactionID uuid.UUID, destinationAccountID *uuid.UUID, destinationBeneficiaryID *uuid.UUID) error {
	query := `UPDATE transactions SET destination_account_id = $1, destination_beneficiary_id = $2, updated_at = NOW() WHERE id = $3`
	_, err := r.db.Exec(ctx, query, destinationAccountID, destinationBeneficiaryID, transactionID)
	return err
}

// DebitWallet performs an atomic debit operation on a user's account.
func (r *PostgresRepository) DebitWallet(ctx context.Context, userID uuid.UUID, amount int64) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var balance int64
	// Use FOR UPDATE to lock the row, preventing race conditions.
	err = tx.QueryRow(ctx, "SELECT balance FROM accounts WHERE user_id = $1 AND account_type = 'primary' FOR UPDATE", userID).Scan(&balance)
	if err != nil {
		if err == pgx.ErrNoRows {
			return ErrAccountNotFound
		}
		return err
	}

	if balance < amount {
		return ErrInsufficientFunds
	}

	_, err = tx.Exec(ctx, "UPDATE accounts SET balance = balance - $1 WHERE user_id = $2 AND account_type = 'primary'", amount, userID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// CreditWallet performs an atomic credit operation on a user's account.
func (r *PostgresRepository) CreditWallet(ctx context.Context, userID uuid.UUID, amount int64) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Use FOR UPDATE to lock the row, preventing race conditions.
	_, err = tx.Exec(ctx, "UPDATE accounts SET balance = balance + $1 WHERE user_id = $2 AND account_type = 'primary'", amount, userID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// FindOrCreateDefaultBeneficiary implements updated default beneficiary logic:
// - Returns the user's default beneficiary if one exists
// - If no default exists, returns the first beneficiary (which should be the default)
// - There should always be a default (the first beneficiary added)
func (r *PostgresRepository) FindOrCreateDefaultBeneficiary(ctx context.Context, userID uuid.UUID) (*domain.Beneficiary, error) {
	// First, try to get an existing default beneficiary
	var beneficiary domain.Beneficiary
	query := `
        SELECT id, user_id, anchor_counterparty_id, account_name, account_number_masked, bank_name, is_default, created_at, updated_at 
        FROM beneficiaries 
        WHERE user_id = $1 AND is_default = true
        LIMIT 1
    `
	err := r.db.QueryRow(ctx, query, userID).Scan(
		&beneficiary.ID, &beneficiary.UserID, &beneficiary.AnchorCounterpartyID,
		&beneficiary.AccountName, &beneficiary.AccountNumberMasked, &beneficiary.BankName,
		&beneficiary.IsDefault, &beneficiary.CreatedAt, &beneficiary.UpdatedAt)

	if err == nil {
		// Found an existing default beneficiary
		return &beneficiary, nil
	}

	if err != pgx.ErrNoRows {
		return nil, err
	}

	// No default beneficiary found, get the first beneficiary (which should be the default)
	// This handles edge cases where the default flag might be missing
	query = `
        SELECT id, user_id, anchor_counterparty_id, account_name, account_number_masked, bank_name, is_default, created_at, updated_at 
        FROM beneficiaries 
        WHERE user_id = $1 
        ORDER BY created_at ASC 
        LIMIT 1
    `
	err = r.db.QueryRow(ctx, query, userID).Scan(
		&beneficiary.ID, &beneficiary.UserID, &beneficiary.AnchorCounterpartyID,
		&beneficiary.AccountName, &beneficiary.AccountNumberMasked, &beneficiary.BankName,
		&beneficiary.IsDefault, &beneficiary.CreatedAt, &beneficiary.UpdatedAt)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrBeneficiaryNotFound
		}
		return nil, err
	}

	// If this beneficiary is not marked as default, mark it as default
	// This handles edge cases where the default flag might be missing
	if !beneficiary.IsDefault {
		// Use a transaction to handle potential race conditions
		tx, txErr := r.db.Begin(ctx)
		if txErr != nil {
			return nil, txErr
		}
		defer tx.Rollback(ctx)

		// First, remove default flag from all user's beneficiaries to avoid constraint violation
		_, updateErr := tx.Exec(ctx, "UPDATE beneficiaries SET is_default = false WHERE user_id = $1", userID)
		if updateErr != nil {
			return nil, updateErr
		}

		// Then set this beneficiary as default
		_, updateErr = tx.Exec(ctx, "UPDATE beneficiaries SET is_default = true WHERE id = $1", beneficiary.ID)
		if updateErr != nil {
			// Check if it's a constraint violation due to race condition
			if pgErr, ok := updateErr.(*pgconn.PgError); ok && pgErr.Code == "23505" {
				// Constraint violation - another request already set a default
				// Rollback and retry by fetching the current default
				tx.Rollback(ctx)
				return r.FindOrCreateDefaultBeneficiary(ctx, userID)
			}
			return nil, updateErr
		}

		// Commit the transaction
		if commitErr := tx.Commit(ctx); commitErr != nil {
			return nil, commitErr
		}

		beneficiary.IsDefault = true
	}

	return &beneficiary, nil
}

// SetDefaultBeneficiary sets a specific beneficiary as the default for a user.
// This is used by subscribed users to explicitly choose their default.
func (r *PostgresRepository) SetDefaultBeneficiary(ctx context.Context, userID uuid.UUID, beneficiaryID uuid.UUID) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// First, verify the beneficiary belongs to the user
	var count int
	err = tx.QueryRow(ctx, "SELECT COUNT(*) FROM beneficiaries WHERE id = $1 AND user_id = $2", beneficiaryID, userID).Scan(&count)
	if err != nil {
		return err
	}
	if count == 0 {
		return ErrBeneficiaryNotFound
	}

	// Remove default flag from all user's beneficiaries
	_, err = tx.Exec(ctx, "UPDATE beneficiaries SET is_default = false WHERE user_id = $1", userID)
	if err != nil {
		return err
	}

	// Set the specified beneficiary as default
	_, err = tx.Exec(ctx, "UPDATE beneficiaries SET is_default = true WHERE id = $1 AND user_id = $2", beneficiaryID, userID)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// FindOrCreateReceivingPreference finds or creates a user's receiving preference.
// Default is to use external account (beneficiary) if available, otherwise internal wallet.
func (r *PostgresRepository) FindOrCreateReceivingPreference(ctx context.Context, userID uuid.UUID) (*domain.UserReceivingPreference, error) {
	var preference domain.UserReceivingPreference

	// Try to find existing preference
	query := `SELECT user_id, use_external_account, default_beneficiary_id, created_at, updated_at FROM user_receiving_preferences WHERE user_id = $1`
	err := r.db.QueryRow(ctx, query, userID).Scan(
		&preference.UserID, &preference.UseExternalAccount, &preference.DefaultBeneficiaryID,
		&preference.CreatedAt, &preference.UpdatedAt)

	if err == nil {
		return &preference, nil
	}

	if err == pgx.ErrNoRows {
		// Create default preference: use external account if user has beneficiaries
		beneficiaries, err := r.FindBeneficiariesByUserID(ctx, userID)
		if err != nil {
			return nil, err
		}

		useExternal := len(beneficiaries) > 0
		var defaultBeneficiaryID *uuid.UUID
		if useExternal && len(beneficiaries) > 0 {
			defaultBeneficiaryID = &beneficiaries[0].ID
		}

		insertQuery := `
            INSERT INTO user_receiving_preferences (user_id, use_external_account, default_beneficiary_id)
            VALUES ($1, $2, $3)
        `
		_, err = r.db.Exec(ctx, insertQuery, userID, useExternal, defaultBeneficiaryID)
		if err != nil {
			return nil, err
		}

		preference = domain.UserReceivingPreference{
			UserID:               userID,
			UseExternalAccount:   useExternal,
			DefaultBeneficiaryID: defaultBeneficiaryID,
			CreatedAt:            time.Now(),
			UpdatedAt:            time.Now(),
		}
		return &preference, nil
	}

	return nil, err
}

// UpdateReceivingPreference updates a user's receiving preference.
func (r *PostgresRepository) UpdateReceivingPreference(ctx context.Context, userID uuid.UUID, useExternal bool, beneficiaryID *uuid.UUID) error {
	// If using external account, validate the beneficiary belongs to the user
	if useExternal && beneficiaryID != nil {
		var count int
		err := r.db.QueryRow(ctx, "SELECT COUNT(*) FROM beneficiaries WHERE id = $1 AND user_id = $2", *beneficiaryID, userID).Scan(&count)
		if err != nil {
			return err
		}
		if count == 0 {
			return ErrBeneficiaryNotFound
		}
	}

	// Update or insert the preference
	query := `
        INSERT INTO user_receiving_preferences (user_id, use_external_account, default_beneficiary_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
            use_external_account = EXCLUDED.use_external_account,
            default_beneficiary_id = EXCLUDED.default_beneficiary_id,
            updated_at = NOW()
    `
	_, err := r.db.Exec(ctx, query, userID, useExternal, beneficiaryID)
	return err
}

// CreatePaymentRequest inserts a new payment request record into the database.
func (r *PostgresRepository) CreatePaymentRequest(ctx context.Context, req *domain.PaymentRequest) (*domain.PaymentRequest, error) {
	query := `
        INSERT INTO payment_requests (id, creator_id, status, amount, description, image_url)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, creator_id, status, amount, description, image_url, created_at, updated_at
    `
	var createdRequest domain.PaymentRequest
	err := r.db.QueryRow(ctx, query, req.ID, req.CreatorID, req.Status, req.Amount, req.Description, req.ImageURL).Scan(
		&createdRequest.ID, &createdRequest.CreatorID, &createdRequest.Status, &createdRequest.Amount,
		&createdRequest.Description, &createdRequest.ImageURL, &createdRequest.CreatedAt, &createdRequest.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &createdRequest, nil
}

// ListPaymentRequestsByCreator retrieves all payment requests created by a specific user.
func (r *PostgresRepository) ListPaymentRequestsByCreator(ctx context.Context, creatorID uuid.UUID) ([]domain.PaymentRequest, error) {
	query := `
        SELECT id, creator_id, status, amount, description, image_url, created_at, updated_at
        FROM payment_requests
        WHERE creator_id = $1
        ORDER BY created_at DESC
    `
	rows, err := r.db.Query(ctx, query, creatorID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []domain.PaymentRequest
	for rows.Next() {
		var request domain.PaymentRequest
		err := rows.Scan(&request.ID, &request.CreatorID, &request.Status, &request.Amount,
			&request.Description, &request.ImageURL, &request.CreatedAt, &request.UpdatedAt)
		if err != nil {
			return nil, err
		}
		requests = append(requests, request)
	}

	return requests, nil
}

// GetPaymentRequestByID retrieves a single payment request by its unique ID.
func (r *PostgresRepository) GetPaymentRequestByID(ctx context.Context, requestID uuid.UUID) (*domain.PaymentRequest, error) {
	query := `
        SELECT id, creator_id, status, amount, description, image_url, created_at, updated_at
        FROM payment_requests
        WHERE id = $1
    `
	var request domain.PaymentRequest
	err := r.db.QueryRow(ctx, query, requestID).Scan(
		&request.ID, &request.CreatorID, &request.Status, &request.Amount,
		&request.Description, &request.ImageURL, &request.CreatedAt, &request.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil // Return nil, nil if not found
		}
		return nil, err
	}
	return &request, nil
}
