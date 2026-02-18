/**
 * @description
 * This file provides the PostgreSQL implementation of the `Repository` interface.
 * It contains all the necessary SQL queries to interact with the database tables
 * related to transactions, users, accounts, and platform fee status.
 *
 * @dependencies
 * - context, time, errors: Standard Go libraries.
 * - github.com/jackc/pgx/v5: The PostgreSQL driver for database operations.
 * - internal/domain: Contains the domain models used for data transfer.
 */

package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/transfa/transaction-service/internal/domain"
)

var (
	ErrUserNotFound           = errors.New("user not found")
	ErrAccountNotFound        = errors.New("account not found")
	ErrBeneficiaryNotFound    = errors.New("beneficiary not found")
	ErrInsufficientFunds      = errors.New("insufficient funds")
	ErrPlatformFeeDelinquent  = errors.New("platform fee delinquent")
	ErrTransactionNotFound    = errors.New("transaction not found")
	ErrTransactionPINNotSet   = errors.New("transaction pin not set")
	ErrPaymentRequestNotFound = errors.New("payment request not found")
	ErrPaymentRequestNotReady = errors.New("payment request is not payable")
	ErrTransferListNotFound   = errors.New("transfer list not found")
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
	query := `SELECT id, btrim(username), full_name, allow_sending, anchor_customer_id FROM users WHERE lower(btrim(username)) = lower(btrim($1))`
	err := r.db.QueryRow(ctx, query, username).Scan(&user.ID, &user.Username, &user.FullName, &user.AllowSending, &user.AnchorCustomerID)
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
	query := `SELECT id, btrim(username), full_name, allow_sending, anchor_customer_id FROM users WHERE id = $1`
	err := r.db.QueryRow(ctx, query, userID).Scan(&user.ID, &user.Username, &user.FullName, &user.AllowSending, &user.AnchorCustomerID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &user, nil
}

// GetUserSecurityCredentialByUserID returns transaction PIN security metadata for a user.
func (r *PostgresRepository) GetUserSecurityCredentialByUserID(ctx context.Context, userID uuid.UUID) (*domain.UserSecurityCredential, error) {
	var credential domain.UserSecurityCredential
	query := `
		SELECT user_id, transaction_pin_hash, failed_attempts, locked_until
		FROM user_security_credentials
		WHERE user_id = $1
	`
	err := r.db.QueryRow(ctx, query, userID).Scan(
		&credential.UserID,
		&credential.TransactionPINHash,
		&credential.FailedAttempts,
		&credential.LockedUntil,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrTransactionPINNotSet
		}
		return nil, err
	}
	if credential.TransactionPINHash == "" {
		return nil, ErrTransactionPINNotSet
	}

	return &credential, nil
}

// RecordFailedTransactionPINAttempt atomically increments failed attempts and applies lockout.
func (r *PostgresRepository) RecordFailedTransactionPINAttempt(ctx context.Context, userID uuid.UUID, maxAttempts int, lockoutDurationSeconds int) (*domain.UserSecurityCredential, error) {
	var credential domain.UserSecurityCredential
	query := `
		UPDATE user_security_credentials
		SET
			failed_attempts = CASE
				WHEN (locked_until IS NOT NULL AND locked_until <= NOW())
					OR (locked_until IS NULL AND failed_attempts >= $2) THEN 1
				ELSE failed_attempts + 1
			END,
			last_failed_at = NOW(),
			locked_until = CASE
				WHEN (
					CASE
						WHEN (locked_until IS NOT NULL AND locked_until <= NOW())
							OR (locked_until IS NULL AND failed_attempts >= $2) THEN 1
						ELSE failed_attempts + 1
					END
				) >= $2 THEN NOW() + ($3 * INTERVAL '1 second')
				ELSE NULL
			END
		WHERE user_id = $1
		RETURNING user_id, transaction_pin_hash, failed_attempts, locked_until
	`
	err := r.db.QueryRow(ctx, query, userID, maxAttempts, lockoutDurationSeconds).Scan(
		&credential.UserID,
		&credential.TransactionPINHash,
		&credential.FailedAttempts,
		&credential.LockedUntil,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrTransactionPINNotSet
		}
		return nil, err
	}

	return &credential, nil
}

// ResetTransactionPINFailureState clears failed-attempt counters after a successful PIN verification.
func (r *PostgresRepository) ResetTransactionPINFailureState(ctx context.Context, userID uuid.UUID) error {
	query := `
		UPDATE user_security_credentials
		SET failed_attempts = 0, last_failed_at = NULL, locked_until = NULL
		WHERE user_id = $1
	`
	result, err := r.db.Exec(ctx, query, userID)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrTransactionPINNotSet
	}
	return nil
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
		       destination_beneficiary_id, type, COALESCE(category, '') AS category, status, amount, fee,
		       COALESCE(description, '') AS description,
		       created_at, updated_at
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

// FindTransactionsBetweenUsers retrieves transactions where user and counterparty are the two parties.
func (r *PostgresRepository) FindTransactionsBetweenUsers(ctx context.Context, userID uuid.UUID, counterpartyID uuid.UUID, limit int, offset int) ([]domain.Transaction, error) {
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	var transactions []domain.Transaction
	query := `
		SELECT id, anchor_transfer_id, sender_id, recipient_id, source_account_id, destination_account_id,
		       destination_beneficiary_id, type, COALESCE(category, '') AS category, status, amount, fee,
		       COALESCE(description, '') AS description, COALESCE(transfer_type, '') AS transfer_type,
		       failure_reason, anchor_session_id, anchor_reason, created_at, updated_at
		FROM transactions
		WHERE
		  (
		    sender_id = $1 AND recipient_id = $2
		  )
		  OR
		  (
		    sender_id = $2 AND recipient_id = $1
		  )
		ORDER BY created_at DESC
		LIMIT $3 OFFSET $4
	`
	rows, err := r.db.Query(ctx, query, userID, counterpartyID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var tx domain.Transaction
		err := rows.Scan(
			&tx.ID,
			&tx.AnchorTransferID,
			&tx.SenderID,
			&tx.RecipientID,
			&tx.SourceAccountID,
			&tx.DestinationAccountID,
			&tx.DestinationBeneficiaryID,
			&tx.Type,
			&tx.Category,
			&tx.Status,
			&tx.Amount,
			&tx.Fee,
			&tx.Description,
			&tx.TransferType,
			&tx.FailureReason,
			&tx.AnchorSessionID,
			&tx.AnchorReason,
			&tx.CreatedAt,
			&tx.UpdatedAt,
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

// IsUserDelinquent checks whether a user is delinquent on platform fees.
func (r *PostgresRepository) IsUserDelinquent(ctx context.Context, userID uuid.UUID) (bool, error) {
	query := `
		SELECT EXISTS (
			SELECT 1
			FROM platform_fee_invoices
			WHERE user_id = $1
			  AND (
				status = 'delinquent'
				OR (status IN ('pending', 'failed') AND grace_until < NOW())
			  )
			  AND NOT EXISTS (
				SELECT 1
				FROM platform_fee_attempts
				WHERE invoice_id = platform_fee_invoices.id
				  AND status = 'success'
			  )
		)
	`
	var delinquent bool
	if err := r.db.QueryRow(ctx, query, userID).Scan(&delinquent); err != nil {
		return false, err
	}

	return delinquent, nil
}

// CreateTransaction inserts a new transaction record into the database.
func (r *PostgresRepository) CreateTransaction(ctx context.Context, tx *domain.Transaction) error {
	query := `
		INSERT INTO transactions (
			id,
			sender_id,
			recipient_id,
			source_account_id,
			destination_account_id,
			destination_beneficiary_id,
			type,
			category,
			status,
			amount,
			fee,
			description,
			anchor_transfer_id,
			transfer_type,
			failure_reason,
			anchor_session_id,
			anchor_reason
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
	`
	_, err := r.db.Exec(ctx, query,
		tx.ID,
		tx.SenderID,
		tx.RecipientID,
		tx.SourceAccountID,
		tx.DestinationAccountID,
		tx.DestinationBeneficiaryID,
		tx.Type,
		tx.Category,
		tx.Status,
		tx.Amount,
		tx.Fee,
		tx.Description,
		tx.AnchorTransferID,
		tx.TransferType,
		tx.FailureReason,
		tx.AnchorSessionID,
		tx.AnchorReason,
	)
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

// UpdateTransactionMetadata updates additional fields such as failure reason and session IDs.
func (r *PostgresRepository) UpdateTransactionMetadata(ctx context.Context, transactionID uuid.UUID, metadata UpdateTransactionMetadataParams) error {
	query := `
		UPDATE transactions
		SET
			status = COALESCE($1, status),
			anchor_transfer_id = COALESCE($2, anchor_transfer_id),
			transfer_type = COALESCE($3, transfer_type),
			failure_reason = COALESCE($4, failure_reason),
			anchor_session_id = COALESCE($5, anchor_session_id),
			anchor_reason = COALESCE($6, anchor_reason),
			updated_at = NOW()
		WHERE id = $7
	`
	_, err := r.db.Exec(ctx, query,
		metadata.Status,
		metadata.AnchorTransferID,
		metadata.TransferType,
		metadata.FailureReason,
		metadata.AnchorSessionID,
		metadata.AnchorReason,
		transactionID,
	)
	return err
}

func (r *PostgresRepository) FindTransactionByAnchorTransferID(ctx context.Context, anchorTransferID string) (*domain.Transaction, error) {
	query := `
		SELECT id, anchor_transfer_id, sender_id, recipient_id, source_account_id,
		       destination_account_id, destination_beneficiary_id, type, category, status,
		       amount, fee, description, transfer_type, failure_reason, anchor_session_id,
		       anchor_reason, created_at, updated_at
		FROM transactions
		WHERE anchor_transfer_id = $1
	`
	var tx domain.Transaction
	err := r.db.QueryRow(ctx, query, anchorTransferID).Scan(
		&tx.ID,
		&tx.AnchorTransferID,
		&tx.SenderID,
		&tx.RecipientID,
		&tx.SourceAccountID,
		&tx.DestinationAccountID,
		&tx.DestinationBeneficiaryID,
		&tx.Type,
		&tx.Category,
		&tx.Status,
		&tx.Amount,
		&tx.Fee,
		&tx.Description,
		&tx.TransferType,
		&tx.FailureReason,
		&tx.AnchorSessionID,
		&tx.AnchorReason,
		&tx.CreatedAt,
		&tx.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrTransactionNotFound
		}
		return nil, err
	}
	return &tx, nil
}

func (r *PostgresRepository) FindTransactionByID(ctx context.Context, transactionID uuid.UUID) (*domain.Transaction, error) {
	query := `
        SELECT id, anchor_transfer_id, sender_id, recipient_id, source_account_id,
               destination_account_id, destination_beneficiary_id, type, category, status,
               amount, fee, description, transfer_type, failure_reason, anchor_session_id,
               anchor_reason, created_at, updated_at
        FROM transactions
        WHERE id = $1
    `
	var tx domain.Transaction
	err := r.db.QueryRow(ctx, query, transactionID).Scan(
		&tx.ID,
		&tx.AnchorTransferID,
		&tx.SenderID,
		&tx.RecipientID,
		&tx.SourceAccountID,
		&tx.DestinationAccountID,
		&tx.DestinationBeneficiaryID,
		&tx.Type,
		&tx.Category,
		&tx.Status,
		&tx.Amount,
		&tx.Fee,
		&tx.Description,
		&tx.TransferType,
		&tx.FailureReason,
		&tx.AnchorSessionID,
		&tx.AnchorReason,
		&tx.CreatedAt,
		&tx.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrTransactionNotFound
		}
		return nil, err
	}
	return &tx, nil
}

// FindLikelyPaymentRequestSettlementTransaction returns a recent transfer that likely settled a payment request.
func (r *PostgresRepository) FindLikelyPaymentRequestSettlementTransaction(ctx context.Context, senderID uuid.UUID, recipientID uuid.UUID, amount int64, description string, since time.Time) (*domain.Transaction, error) {
	query := `
        SELECT id, anchor_transfer_id, sender_id, recipient_id, source_account_id,
               destination_account_id, destination_beneficiary_id, type, category, status,
               amount, fee, description, transfer_type, failure_reason, anchor_session_id,
               anchor_reason, created_at, updated_at
        FROM transactions
        WHERE sender_id = $1
          AND recipient_id = $2
          AND amount = $3
          AND description = $4
          AND category = 'p2p_transfer'
          AND status IN ('pending', 'failed', 'completed')
          AND created_at >= $5
        ORDER BY created_at DESC
        LIMIT 1
    `

	var tx domain.Transaction
	err := r.db.QueryRow(ctx, query, senderID, recipientID, amount, description, since).Scan(
		&tx.ID,
		&tx.AnchorTransferID,
		&tx.SenderID,
		&tx.RecipientID,
		&tx.SourceAccountID,
		&tx.DestinationAccountID,
		&tx.DestinationBeneficiaryID,
		&tx.Type,
		&tx.Category,
		&tx.Status,
		&tx.Amount,
		&tx.Fee,
		&tx.Description,
		&tx.TransferType,
		&tx.FailureReason,
		&tx.AnchorSessionID,
		&tx.AnchorReason,
		&tx.CreatedAt,
		&tx.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &tx, nil
}

func (r *PostgresRepository) RefundTransactionFee(ctx context.Context, transactionID uuid.UUID, userID uuid.UUID, fee int64) error {
	if fee <= 0 {
		return nil
	}
	_, err := r.db.Exec(ctx, "UPDATE accounts SET balance = balance + $1 WHERE user_id = $2 AND account_type = 'primary'", fee, userID)
	return err
}

func (r *PostgresRepository) MarkTransactionAsFailed(ctx context.Context, transactionID uuid.UUID, anchorTransferID, failureReason string) error {
	query := `UPDATE transactions SET status = 'failed', anchor_transfer_id = COALESCE($2, anchor_transfer_id), failure_reason = COALESCE($3, failure_reason), updated_at = NOW() WHERE id = $1`
	_, err := r.db.Exec(ctx, query, transactionID, anchorTransferID, failureReason)
	return err
}

func (r *PostgresRepository) MarkTransactionAsCompleted(ctx context.Context, transactionID uuid.UUID, anchorTransferID string) error {
	query := `UPDATE transactions SET status = 'completed', anchor_transfer_id = COALESCE($2, anchor_transfer_id), updated_at = NOW() WHERE id = $1`
	_, err := r.db.Exec(ctx, query, transactionID, anchorTransferID)
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

// CreateTransferBatch inserts a transfer batch audit record.
func (r *PostgresRepository) CreateTransferBatch(ctx context.Context, batch *domain.TransferBatch) error {
	query := `
		INSERT INTO transfer_batches (
			id, sender_id, status, requested_count, success_count, failure_count, total_amount, total_fee
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	_, err := r.db.Exec(ctx, query,
		batch.ID,
		batch.SenderID,
		batch.Status,
		batch.RequestedCount,
		batch.SuccessCount,
		batch.FailureCount,
		batch.TotalAmount,
		batch.TotalFee,
	)
	return err
}

// CreateTransferBatchWithItems inserts a transfer batch and its item rows atomically.
func (r *PostgresRepository) CreateTransferBatchWithItems(ctx context.Context, batch *domain.TransferBatch, items []domain.TransferBatchItem) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	batchQuery := `
		INSERT INTO transfer_batches (
			id, sender_id, status, requested_count, success_count, failure_count, total_amount, total_fee
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`
	if _, err := tx.Exec(ctx, batchQuery,
		batch.ID,
		batch.SenderID,
		batch.Status,
		batch.RequestedCount,
		batch.SuccessCount,
		batch.FailureCount,
		batch.TotalAmount,
		batch.TotalFee,
	); err != nil {
		return err
	}

	if len(items) > 0 {
		itemQuery := `
			INSERT INTO transfer_batch_items (
				id, batch_id, recipient_username, amount, description, status, fee, transaction_id, failure_reason
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		`
		for _, item := range items {
			if _, err := tx.Exec(ctx, itemQuery,
				item.ID,
				item.BatchID,
				item.RecipientUsername,
				item.Amount,
				item.Description,
				item.Status,
				item.Fee,
				item.TransactionID,
				item.FailureReason,
			); err != nil {
				return err
			}
		}
	}

	return tx.Commit(ctx)
}

// CreateTransferBatchItems inserts all pending item rows for a transfer batch atomically.
func (r *PostgresRepository) CreateTransferBatchItems(ctx context.Context, items []domain.TransferBatchItem) error {
	if len(items) == 0 {
		return nil
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	query := `
		INSERT INTO transfer_batch_items (
			id, batch_id, recipient_username, amount, description, status, fee, transaction_id, failure_reason
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	for _, item := range items {
		_, err := tx.Exec(ctx, query,
			item.ID,
			item.BatchID,
			item.RecipientUsername,
			item.Amount,
			item.Description,
			item.Status,
			item.Fee,
			item.TransactionID,
			item.FailureReason,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

// MarkTransferBatchItemCompleted updates one batch item as completed.
func (r *PostgresRepository) MarkTransferBatchItemCompleted(ctx context.Context, itemID uuid.UUID, transactionID uuid.UUID, fee int64) error {
	query := `
		UPDATE transfer_batch_items
		SET status = 'completed', transaction_id = $2, fee = $3, failure_reason = NULL, updated_at = NOW()
		WHERE id = $1
	`
	result, err := r.db.Exec(ctx, query, itemID, transactionID, fee)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrTransactionNotFound
	}
	return nil
}

// MarkTransferBatchItemFailed updates one batch item as failed.
func (r *PostgresRepository) MarkTransferBatchItemFailed(ctx context.Context, itemID uuid.UUID, failureReason string) error {
	query := `
		UPDATE transfer_batch_items
		SET status = 'failed', failure_reason = $2, transaction_id = NULL, fee = 0, updated_at = NOW()
		WHERE id = $1
	`
	result, err := r.db.Exec(ctx, query, itemID, failureReason)
	if err != nil {
		return err
	}
	if result.RowsAffected() == 0 {
		return ErrTransactionNotFound
	}
	return nil
}

// FinalizeTransferBatch computes and persists aggregate batch metrics from item rows.
func (r *PostgresRepository) FinalizeTransferBatch(ctx context.Context, batchID uuid.UUID) (*domain.TransferBatch, error) {
	query := `
		WITH agg AS (
			SELECT
				COUNT(*) FILTER (WHERE status = 'completed') AS success_count,
				COUNT(*) FILTER (WHERE status = 'failed') AS failure_count,
				COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS total_amount,
				COALESCE(SUM(fee) FILTER (WHERE status = 'completed'), 0) AS total_fee
			FROM transfer_batch_items
			WHERE batch_id = $1
		)
		UPDATE transfer_batches b
		SET
			success_count = agg.success_count,
			failure_count = agg.failure_count,
			total_amount = agg.total_amount,
			total_fee = agg.total_fee,
			status = CASE
				WHEN agg.success_count = 0 AND agg.failure_count > 0 THEN 'failed'
				WHEN agg.failure_count = 0 THEN 'completed'
				WHEN agg.success_count > 0 AND agg.failure_count > 0 THEN 'partial_failed'
				ELSE 'processing'
			END,
			updated_at = NOW()
		FROM agg
		WHERE b.id = $1
		RETURNING b.id, b.sender_id, b.status, b.requested_count, b.success_count, b.failure_count, b.total_amount, b.total_fee, b.created_at, b.updated_at
	`

	var batch domain.TransferBatch
	err := r.db.QueryRow(ctx, query, batchID).Scan(
		&batch.ID,
		&batch.SenderID,
		&batch.Status,
		&batch.RequestedCount,
		&batch.SuccessCount,
		&batch.FailureCount,
		&batch.TotalAmount,
		&batch.TotalFee,
		&batch.CreatedAt,
		&batch.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrTransactionNotFound
		}
		return nil, err
	}

	return &batch, nil
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
        INSERT INTO payment_requests (
            id,
            creator_id,
            status,
            request_type,
            title,
            recipient_user_id,
            recipient_username_snapshot,
            recipient_full_name_snapshot,
            amount,
            description,
            image_url
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING
            id,
            creator_id,
            status,
            request_type,
            title,
            recipient_user_id,
            recipient_username_snapshot,
            recipient_full_name_snapshot,
            amount,
            description,
            image_url,
            fulfilled_by_user_id,
            settled_transaction_id,
            processing_started_at,
            responded_at,
            declined_reason,
            deleted_at,
            created_at,
            updated_at
    `
	var createdRequest domain.PaymentRequest
	err := r.db.QueryRow(
		ctx,
		query,
		req.ID,
		req.CreatorID,
		req.Status,
		req.RequestType,
		req.Title,
		req.RecipientUserID,
		req.RecipientUsername,
		req.RecipientFullName,
		req.Amount,
		req.Description,
		req.ImageURL,
	).Scan(
		&createdRequest.ID,
		&createdRequest.CreatorID,
		&createdRequest.Status,
		&createdRequest.RequestType,
		&createdRequest.Title,
		&createdRequest.RecipientUserID,
		&createdRequest.RecipientUsername,
		&createdRequest.RecipientFullName,
		&createdRequest.Amount,
		&createdRequest.Description,
		&createdRequest.ImageURL,
		&createdRequest.FulfilledByUserID,
		&createdRequest.SettledTxID,
		&createdRequest.ProcessingStarted,
		&createdRequest.RespondedAt,
		&createdRequest.DeclinedReason,
		&createdRequest.DeletedAt,
		&createdRequest.CreatedAt,
		&createdRequest.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &createdRequest, nil
}

// ListPaymentRequestsByCreator retrieves all payment requests created by a specific user.
func (r *PostgresRepository) ListPaymentRequestsByCreator(ctx context.Context, creatorID uuid.UUID, opts domain.PaymentRequestListOptions) ([]domain.PaymentRequest, error) {
	limit := opts.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	offset := opts.Offset
	if offset < 0 {
		offset = 0
	}

	query := `
        SELECT
            pr.id,
            pr.creator_id,
            btrim(cu.username) AS creator_username,
            cu.full_name AS creator_full_name,
            pr.status,
            pr.request_type,
            pr.title,
            pr.recipient_user_id,
            COALESCE(NULLIF(btrim(pr.recipient_username_snapshot), ''), btrim(ru.username)) AS recipient_username,
            COALESCE(pr.recipient_full_name_snapshot, ru.full_name) AS recipient_full_name,
            pr.amount,
            pr.description,
            pr.image_url,
            pr.fulfilled_by_user_id,
            pr.settled_transaction_id,
            pr.processing_started_at,
            pr.responded_at,
            pr.declined_reason,
            pr.deleted_at,
            pr.created_at,
            pr.updated_at
        FROM payment_requests pr
        LEFT JOIN users ru ON ru.id = pr.recipient_user_id
        LEFT JOIN users cu ON cu.id = pr.creator_id
        WHERE pr.creator_id = $1
          AND pr.deleted_at IS NULL
    `

	args := []interface{}{creatorID}
	argPos := 2
	if opts.Search != "" {
		query += fmt.Sprintf(`
          AND (
            COALESCE(NULLIF(btrim(pr.recipient_username_snapshot), ''), btrim(ru.username), '') ILIKE '%%' || $%d || '%%'
            OR COALESCE(pr.recipient_full_name_snapshot, ru.full_name, '') ILIKE '%%' || $%d || '%%'
            OR pr.title ILIKE '%%' || $%d || '%%'
          )
        `, argPos, argPos, argPos)
		args = append(args, opts.Search)
		argPos++
	}

	query += fmt.Sprintf(`
        ORDER BY pr.created_at DESC
        LIMIT $%d OFFSET $%d
    `, argPos, argPos+1)
	args = append(args, limit, offset)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var requests []domain.PaymentRequest
	for rows.Next() {
		var request domain.PaymentRequest
		err := rows.Scan(
			&request.ID,
			&request.CreatorID,
			&request.CreatorUsername,
			&request.CreatorFullName,
			&request.Status,
			&request.RequestType,
			&request.Title,
			&request.RecipientUserID,
			&request.RecipientUsername,
			&request.RecipientFullName,
			&request.Amount,
			&request.Description,
			&request.ImageURL,
			&request.FulfilledByUserID,
			&request.SettledTxID,
			&request.ProcessingStarted,
			&request.RespondedAt,
			&request.DeclinedReason,
			&request.DeletedAt,
			&request.CreatedAt,
			&request.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		requests = append(requests, request)
	}

	return requests, nil
}

// GetPaymentRequestByID retrieves a single payment request by its unique ID.
func (r *PostgresRepository) GetPaymentRequestByID(ctx context.Context, requestID uuid.UUID, creatorID uuid.UUID) (*domain.PaymentRequest, error) {
	query := `
        SELECT
            pr.id,
            pr.creator_id,
            btrim(cu.username) AS creator_username,
            cu.full_name AS creator_full_name,
            pr.status,
            pr.request_type,
            pr.title,
            pr.recipient_user_id,
            COALESCE(NULLIF(btrim(pr.recipient_username_snapshot), ''), btrim(ru.username)) AS recipient_username,
            COALESCE(pr.recipient_full_name_snapshot, ru.full_name) AS recipient_full_name,
            pr.amount,
            pr.description,
            pr.image_url,
            pr.fulfilled_by_user_id,
            pr.settled_transaction_id,
            pr.processing_started_at,
            pr.responded_at,
            pr.declined_reason,
            pr.deleted_at,
            pr.created_at,
            pr.updated_at
        FROM payment_requests pr
        LEFT JOIN users ru ON ru.id = pr.recipient_user_id
        LEFT JOIN users cu ON cu.id = pr.creator_id
        WHERE pr.id = $1
          AND pr.creator_id = $2
          AND pr.deleted_at IS NULL
    `
	var request domain.PaymentRequest
	err := r.db.QueryRow(ctx, query, requestID, creatorID).Scan(
		&request.ID,
		&request.CreatorID,
		&request.CreatorUsername,
		&request.CreatorFullName,
		&request.Status,
		&request.RequestType,
		&request.Title,
		&request.RecipientUserID,
		&request.RecipientUsername,
		&request.RecipientFullName,
		&request.Amount,
		&request.Description,
		&request.ImageURL,
		&request.FulfilledByUserID,
		&request.SettledTxID,
		&request.ProcessingStarted,
		&request.RespondedAt,
		&request.DeclinedReason,
		&request.DeletedAt,
		&request.CreatedAt,
		&request.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil // Return nil, nil if not found
		}
		return nil, err
	}
	return &request, nil
}

// DeletePaymentRequest soft-deletes a creator-owned payment request.
func (r *PostgresRepository) DeletePaymentRequest(ctx context.Context, requestID uuid.UUID, creatorID uuid.UUID) (bool, error) {
	query := `
        UPDATE payment_requests
        SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1
          AND creator_id = $2
          AND deleted_at IS NULL
    `
	tag, err := r.db.Exec(ctx, query, requestID, creatorID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

// ListIncomingPaymentRequests retrieves individual requests where the authenticated user is the recipient.
func (r *PostgresRepository) ListIncomingPaymentRequests(ctx context.Context, recipientID uuid.UUID, opts domain.PaymentRequestListOptions) ([]domain.PaymentRequest, error) {
	limit := opts.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	offset := opts.Offset
	if offset < 0 {
		offset = 0
	}

	query := `
        SELECT
            pr.id,
            pr.creator_id,
            btrim(cu.username) AS creator_username,
            cu.full_name AS creator_full_name,
            pr.status,
            pr.request_type,
            pr.title,
            pr.recipient_user_id,
            COALESCE(NULLIF(btrim(pr.recipient_username_snapshot), ''), btrim(ru.username)) AS recipient_username,
            COALESCE(pr.recipient_full_name_snapshot, ru.full_name) AS recipient_full_name,
            pr.amount,
            pr.description,
            pr.image_url,
            pr.fulfilled_by_user_id,
            pr.settled_transaction_id,
            pr.processing_started_at,
            pr.responded_at,
            pr.declined_reason,
            pr.deleted_at,
            pr.created_at,
            pr.updated_at
        FROM payment_requests pr
        LEFT JOIN users ru ON ru.id = pr.recipient_user_id
        LEFT JOIN users cu ON cu.id = pr.creator_id
        WHERE pr.recipient_user_id = $1
          AND pr.request_type = 'individual'
          AND pr.deleted_at IS NULL
    `

	args := []interface{}{recipientID}
	argPos := 2

	if status := strings.TrimSpace(strings.ToLower(opts.Status)); status != "" {
		query += fmt.Sprintf(" AND pr.status = $%d", argPos)
		args = append(args, status)
		argPos++
	}

	if search := strings.TrimSpace(opts.Search); search != "" {
		query += fmt.Sprintf(`
          AND (
            COALESCE(btrim(cu.username), '') ILIKE '%%' || $%d || '%%'
            OR COALESCE(cu.full_name, '') ILIKE '%%' || $%d || '%%'
            OR pr.title ILIKE '%%' || $%d || '%%'
          )
        `, argPos, argPos, argPos)
		args = append(args, search)
		argPos++
	}

	query += fmt.Sprintf(`
        ORDER BY pr.created_at DESC
        LIMIT $%d OFFSET $%d
    `, argPos, argPos+1)
	args = append(args, limit, offset)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]domain.PaymentRequest, 0, limit)
	for rows.Next() {
		var item domain.PaymentRequest
		if err := rows.Scan(
			&item.ID,
			&item.CreatorID,
			&item.CreatorUsername,
			&item.CreatorFullName,
			&item.Status,
			&item.RequestType,
			&item.Title,
			&item.RecipientUserID,
			&item.RecipientUsername,
			&item.RecipientFullName,
			&item.Amount,
			&item.Description,
			&item.ImageURL,
			&item.FulfilledByUserID,
			&item.SettledTxID,
			&item.ProcessingStarted,
			&item.RespondedAt,
			&item.DeclinedReason,
			&item.DeletedAt,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		results = append(results, item)
	}
	return results, nil
}

// GetIncomingPaymentRequestByID retrieves one incoming request for a recipient user.
func (r *PostgresRepository) GetIncomingPaymentRequestByID(ctx context.Context, requestID uuid.UUID, recipientID uuid.UUID) (*domain.PaymentRequest, error) {
	query := `
        SELECT
            pr.id,
            pr.creator_id,
            btrim(cu.username) AS creator_username,
            cu.full_name AS creator_full_name,
            pr.status,
            pr.request_type,
            pr.title,
            pr.recipient_user_id,
            COALESCE(NULLIF(btrim(pr.recipient_username_snapshot), ''), btrim(ru.username)) AS recipient_username,
            COALESCE(pr.recipient_full_name_snapshot, ru.full_name) AS recipient_full_name,
            pr.amount,
            pr.description,
            pr.image_url,
            pr.fulfilled_by_user_id,
            pr.settled_transaction_id,
            pr.processing_started_at,
            pr.responded_at,
            pr.declined_reason,
            pr.deleted_at,
            pr.created_at,
            pr.updated_at
        FROM payment_requests pr
        LEFT JOIN users ru ON ru.id = pr.recipient_user_id
        LEFT JOIN users cu ON cu.id = pr.creator_id
        WHERE pr.id = $1
          AND pr.recipient_user_id = $2
          AND pr.request_type = 'individual'
          AND pr.deleted_at IS NULL
    `

	var item domain.PaymentRequest
	err := r.db.QueryRow(ctx, query, requestID, recipientID).Scan(
		&item.ID,
		&item.CreatorID,
		&item.CreatorUsername,
		&item.CreatorFullName,
		&item.Status,
		&item.RequestType,
		&item.Title,
		&item.RecipientUserID,
		&item.RecipientUsername,
		&item.RecipientFullName,
		&item.Amount,
		&item.Description,
		&item.ImageURL,
		&item.FulfilledByUserID,
		&item.SettledTxID,
		&item.ProcessingStarted,
		&item.RespondedAt,
		&item.DeclinedReason,
		&item.DeletedAt,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &item, nil
}

// ClaimIncomingPaymentRequestForPayment atomically moves an incoming request into processing state.
func (r *PostgresRepository) ClaimIncomingPaymentRequestForPayment(ctx context.Context, requestID uuid.UUID, recipientID uuid.UUID) (*domain.PaymentRequest, error) {
	query := `
        WITH claimed AS (
            UPDATE payment_requests
            SET
                status = 'processing',
                processing_started_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
              AND recipient_user_id = $2
              AND request_type = 'individual'
              AND deleted_at IS NULL
              AND (
                status = 'pending'
                OR (status = 'processing' AND processing_started_at < NOW() - INTERVAL '5 minutes')
              )
            RETURNING *
        )
        SELECT
            c.id,
            c.creator_id,
            btrim(cu.username) AS creator_username,
            cu.full_name AS creator_full_name,
            c.status,
            c.request_type,
            c.title,
            c.recipient_user_id,
            COALESCE(NULLIF(btrim(c.recipient_username_snapshot), ''), btrim(ru.username)) AS recipient_username,
            COALESCE(c.recipient_full_name_snapshot, ru.full_name) AS recipient_full_name,
            c.amount,
            c.description,
            c.image_url,
            c.fulfilled_by_user_id,
            c.settled_transaction_id,
            c.processing_started_at,
            c.responded_at,
            c.declined_reason,
            c.deleted_at,
            c.created_at,
            c.updated_at
        FROM claimed c
        LEFT JOIN users ru ON ru.id = c.recipient_user_id
        LEFT JOIN users cu ON cu.id = c.creator_id
    `

	var item domain.PaymentRequest
	err := r.db.QueryRow(ctx, query, requestID, recipientID).Scan(
		&item.ID,
		&item.CreatorID,
		&item.CreatorUsername,
		&item.CreatorFullName,
		&item.Status,
		&item.RequestType,
		&item.Title,
		&item.RecipientUserID,
		&item.RecipientUsername,
		&item.RecipientFullName,
		&item.Amount,
		&item.Description,
		&item.ImageURL,
		&item.FulfilledByUserID,
		&item.SettledTxID,
		&item.ProcessingStarted,
		&item.RespondedAt,
		&item.DeclinedReason,
		&item.DeletedAt,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrPaymentRequestNotReady
		}
		return nil, err
	}
	return &item, nil
}

// AttachProcessingPaymentRequestSettlementTransaction links an in-flight transfer to a processing request.
func (r *PostgresRepository) AttachProcessingPaymentRequestSettlementTransaction(ctx context.Context, requestID uuid.UUID, recipientID uuid.UUID, settledTransactionID uuid.UUID) (*domain.PaymentRequest, error) {
	query := `
        WITH updated AS (
            UPDATE payment_requests
            SET
                settled_transaction_id = $3,
                updated_at = NOW()
            WHERE id = $1
              AND recipient_user_id = $2
              AND request_type = 'individual'
              AND deleted_at IS NULL
              AND status = 'processing'
            RETURNING *
        )
        SELECT
            u.id,
            u.creator_id,
            btrim(cu.username) AS creator_username,
            cu.full_name AS creator_full_name,
            u.status,
            u.request_type,
            u.title,
            u.recipient_user_id,
            COALESCE(NULLIF(btrim(u.recipient_username_snapshot), ''), btrim(ru.username)) AS recipient_username,
            COALESCE(u.recipient_full_name_snapshot, ru.full_name) AS recipient_full_name,
            u.amount,
            u.description,
            u.image_url,
            u.fulfilled_by_user_id,
            u.settled_transaction_id,
            u.processing_started_at,
            u.responded_at,
            u.declined_reason,
            u.deleted_at,
            u.created_at,
            u.updated_at
        FROM updated u
        LEFT JOIN users ru ON ru.id = u.recipient_user_id
        LEFT JOIN users cu ON cu.id = u.creator_id
    `

	var item domain.PaymentRequest
	err := r.db.QueryRow(ctx, query, requestID, recipientID, settledTransactionID).Scan(
		&item.ID,
		&item.CreatorID,
		&item.CreatorUsername,
		&item.CreatorFullName,
		&item.Status,
		&item.RequestType,
		&item.Title,
		&item.RecipientUserID,
		&item.RecipientUsername,
		&item.RecipientFullName,
		&item.Amount,
		&item.Description,
		&item.ImageURL,
		&item.FulfilledByUserID,
		&item.SettledTxID,
		&item.ProcessingStarted,
		&item.RespondedAt,
		&item.DeclinedReason,
		&item.DeletedAt,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrPaymentRequestNotReady
		}
		return nil, err
	}
	return &item, nil
}

// MarkPaymentRequestFulfilled finalizes a processing request after successful transfer.
func (r *PostgresRepository) MarkPaymentRequestFulfilled(ctx context.Context, requestID uuid.UUID, recipientID uuid.UUID, settledTransactionID uuid.UUID) (*domain.PaymentRequest, error) {
	query := `
        WITH updated AS (
            UPDATE payment_requests
            SET
                status = 'fulfilled',
                fulfilled_by_user_id = $3,
                settled_transaction_id = $4,
                processing_started_at = NULL,
                responded_at = NOW(),
                declined_reason = NULL,
                updated_at = NOW()
            WHERE id = $1
              AND recipient_user_id = $2
              AND request_type = 'individual'
              AND deleted_at IS NULL
              AND status = 'processing'
            RETURNING *
        )
        SELECT
            u.id,
            u.creator_id,
            btrim(cu.username) AS creator_username,
            cu.full_name AS creator_full_name,
            u.status,
            u.request_type,
            u.title,
            u.recipient_user_id,
            COALESCE(NULLIF(btrim(u.recipient_username_snapshot), ''), btrim(ru.username)) AS recipient_username,
            COALESCE(u.recipient_full_name_snapshot, ru.full_name) AS recipient_full_name,
            u.amount,
            u.description,
            u.image_url,
            u.fulfilled_by_user_id,
            u.settled_transaction_id,
            u.processing_started_at,
            u.responded_at,
            u.declined_reason,
            u.deleted_at,
            u.created_at,
            u.updated_at
        FROM updated u
        LEFT JOIN users ru ON ru.id = u.recipient_user_id
        LEFT JOIN users cu ON cu.id = u.creator_id
    `

	var item domain.PaymentRequest
	err := r.db.QueryRow(ctx, query, requestID, recipientID, recipientID, settledTransactionID).Scan(
		&item.ID,
		&item.CreatorID,
		&item.CreatorUsername,
		&item.CreatorFullName,
		&item.Status,
		&item.RequestType,
		&item.Title,
		&item.RecipientUserID,
		&item.RecipientUsername,
		&item.RecipientFullName,
		&item.Amount,
		&item.Description,
		&item.ImageURL,
		&item.FulfilledByUserID,
		&item.SettledTxID,
		&item.ProcessingStarted,
		&item.RespondedAt,
		&item.DeclinedReason,
		&item.DeletedAt,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrPaymentRequestNotReady
		}
		return nil, err
	}
	return &item, nil
}

// MarkPaymentRequestFulfilledBySettlementTransaction finalizes a processing request from transfer completion.
func (r *PostgresRepository) MarkPaymentRequestFulfilledBySettlementTransaction(ctx context.Context, settledTransactionID uuid.UUID) (*domain.PaymentRequest, error) {
	query := `
        WITH updated AS (
            UPDATE payment_requests
            SET
                status = 'fulfilled',
                fulfilled_by_user_id = recipient_user_id,
                processing_started_at = NULL,
                responded_at = NOW(),
                declined_reason = NULL,
                updated_at = NOW()
            WHERE settled_transaction_id = $1
              AND request_type = 'individual'
              AND deleted_at IS NULL
              AND status = 'processing'
            RETURNING *
        )
        SELECT
            u.id,
            u.creator_id,
            btrim(cu.username) AS creator_username,
            cu.full_name AS creator_full_name,
            u.status,
            u.request_type,
            u.title,
            u.recipient_user_id,
            COALESCE(NULLIF(btrim(u.recipient_username_snapshot), ''), btrim(ru.username)) AS recipient_username,
            COALESCE(u.recipient_full_name_snapshot, ru.full_name) AS recipient_full_name,
            u.amount,
            u.description,
            u.image_url,
            u.fulfilled_by_user_id,
            u.settled_transaction_id,
            u.processing_started_at,
            u.responded_at,
            u.declined_reason,
            u.deleted_at,
            u.created_at,
            u.updated_at
        FROM updated u
        LEFT JOIN users ru ON ru.id = u.recipient_user_id
        LEFT JOIN users cu ON cu.id = u.creator_id
    `

	var item domain.PaymentRequest
	err := r.db.QueryRow(ctx, query, settledTransactionID).Scan(
		&item.ID,
		&item.CreatorID,
		&item.CreatorUsername,
		&item.CreatorFullName,
		&item.Status,
		&item.RequestType,
		&item.Title,
		&item.RecipientUserID,
		&item.RecipientUsername,
		&item.RecipientFullName,
		&item.Amount,
		&item.Description,
		&item.ImageURL,
		&item.FulfilledByUserID,
		&item.SettledTxID,
		&item.ProcessingStarted,
		&item.RespondedAt,
		&item.DeclinedReason,
		&item.DeletedAt,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return &item, nil
}

// ReleasePaymentRequestFromProcessing resets request state to pending after a failed payment attempt.
func (r *PostgresRepository) ReleasePaymentRequestFromProcessing(ctx context.Context, requestID uuid.UUID, recipientID uuid.UUID) error {
	query := `
        UPDATE payment_requests
        SET status = 'pending', processing_started_at = NULL, updated_at = NOW()
        WHERE id = $1
          AND recipient_user_id = $2
          AND request_type = 'individual'
          AND deleted_at IS NULL
          AND status = 'processing'
    `
	_, err := r.db.Exec(ctx, query, requestID, recipientID)
	return err
}

// ReleasePaymentRequestFromProcessingBySettlementTransaction resets a processing request after transfer failure.
func (r *PostgresRepository) ReleasePaymentRequestFromProcessingBySettlementTransaction(ctx context.Context, settledTransactionID uuid.UUID) error {
	query := `
        UPDATE payment_requests
        SET
            status = 'pending',
            processing_started_at = NULL,
            settled_transaction_id = NULL,
            updated_at = NOW()
        WHERE settled_transaction_id = $1
          AND request_type = 'individual'
          AND deleted_at IS NULL
          AND status = 'processing'
    `
	_, err := r.db.Exec(ctx, query, settledTransactionID)
	return err
}

// DeclineIncomingPaymentRequest marks an incoming request as declined.
func (r *PostgresRepository) DeclineIncomingPaymentRequest(ctx context.Context, requestID uuid.UUID, recipientID uuid.UUID, reason *string) (*domain.PaymentRequest, error) {
	query := `
        WITH updated AS (
            UPDATE payment_requests
            SET
                status = 'declined',
                declined_reason = $3,
                processing_started_at = NULL,
                responded_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
              AND recipient_user_id = $2
              AND request_type = 'individual'
              AND deleted_at IS NULL
              AND status = 'pending'
            RETURNING *
        )
        SELECT
            u.id,
            u.creator_id,
            btrim(cu.username) AS creator_username,
            cu.full_name AS creator_full_name,
            u.status,
            u.request_type,
            u.title,
            u.recipient_user_id,
            COALESCE(NULLIF(btrim(u.recipient_username_snapshot), ''), btrim(ru.username)) AS recipient_username,
            COALESCE(u.recipient_full_name_snapshot, ru.full_name) AS recipient_full_name,
            u.amount,
            u.description,
            u.image_url,
            u.fulfilled_by_user_id,
            u.settled_transaction_id,
            u.processing_started_at,
            u.responded_at,
            u.declined_reason,
            u.deleted_at,
            u.created_at,
            u.updated_at
        FROM updated u
        LEFT JOIN users ru ON ru.id = u.recipient_user_id
        LEFT JOIN users cu ON cu.id = u.creator_id
    `

	var item domain.PaymentRequest
	err := r.db.QueryRow(ctx, query, requestID, recipientID, reason).Scan(
		&item.ID,
		&item.CreatorID,
		&item.CreatorUsername,
		&item.CreatorFullName,
		&item.Status,
		&item.RequestType,
		&item.Title,
		&item.RecipientUserID,
		&item.RecipientUsername,
		&item.RecipientFullName,
		&item.Amount,
		&item.Description,
		&item.ImageURL,
		&item.FulfilledByUserID,
		&item.SettledTxID,
		&item.ProcessingStarted,
		&item.RespondedAt,
		&item.DeclinedReason,
		&item.DeletedAt,
		&item.CreatedAt,
		&item.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrPaymentRequestNotReady
		}
		return nil, err
	}
	return &item, nil
}

// CreateInAppNotification writes a new inbox notification and supports idempotent dedupe keys.
func (r *PostgresRepository) CreateInAppNotification(ctx context.Context, item domain.InAppNotification) error {
	data := item.Data
	if data == nil {
		data = map[string]interface{}{}
	}
	dataJSON, err := json.Marshal(data)
	if err != nil {
		return err
	}

	if item.DedupeKey != nil && strings.TrimSpace(*item.DedupeKey) != "" {
		query := `
            INSERT INTO in_app_notifications (
                id, user_id, category, type, title, body, status,
                related_entity_type, related_entity_id, data, dedupe_key, read_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
        `
		_, err = r.db.Exec(ctx, query,
			item.ID,
			item.UserID,
			item.Category,
			item.Type,
			item.Title,
			item.Body,
			item.Status,
			item.RelatedEntityType,
			item.RelatedEntityID,
			dataJSON,
			item.DedupeKey,
			item.ReadAt,
		)
		return err
	}

	query := `
        INSERT INTO in_app_notifications (
            id, user_id, category, type, title, body, status,
            related_entity_type, related_entity_id, data, dedupe_key, read_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    `
	_, err = r.db.Exec(ctx, query,
		item.ID,
		item.UserID,
		item.Category,
		item.Type,
		item.Title,
		item.Body,
		item.Status,
		item.RelatedEntityType,
		item.RelatedEntityID,
		dataJSON,
		item.DedupeKey,
		item.ReadAt,
	)
	return err
}

// ListInAppNotifications retrieves paginated inbox notifications.
func (r *PostgresRepository) ListInAppNotifications(ctx context.Context, userID uuid.UUID, opts domain.NotificationListOptions) ([]domain.InAppNotification, error) {
	limit := opts.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	offset := opts.Offset
	if offset < 0 {
		offset = 0
	}

	query := `
        SELECT
            id, user_id, category, type, title, body, status,
            related_entity_type, related_entity_id, data, dedupe_key,
            read_at, created_at, updated_at
        FROM in_app_notifications
        WHERE user_id = $1
    `
	args := []interface{}{userID}
	argPos := 2

	if category := strings.TrimSpace(strings.ToLower(opts.Category)); category != "" {
		query += fmt.Sprintf(" AND category = $%d", argPos)
		args = append(args, category)
		argPos++
	}
	if status := strings.TrimSpace(strings.ToLower(opts.Status)); status != "" {
		query += fmt.Sprintf(" AND status = $%d", argPos)
		args = append(args, status)
		argPos++
	}
	if search := strings.TrimSpace(opts.Search); search != "" {
		query += fmt.Sprintf(`
          AND (
            title ILIKE '%%' || $%d || '%%'
            OR COALESCE(body, '') ILIKE '%%' || $%d || '%%'
            OR COALESCE(data->>'actor_username', '') ILIKE '%%' || $%d || '%%'
          )
        `, argPos, argPos, argPos)
		args = append(args, search)
		argPos++
	}

	query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", argPos, argPos+1)
	args = append(args, limit, offset)

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]domain.InAppNotification, 0, limit)
	for rows.Next() {
		var item domain.InAppNotification
		var payload []byte
		if err := rows.Scan(
			&item.ID,
			&item.UserID,
			&item.Category,
			&item.Type,
			&item.Title,
			&item.Body,
			&item.Status,
			&item.RelatedEntityType,
			&item.RelatedEntityID,
			&payload,
			&item.DedupeKey,
			&item.ReadAt,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		item.Data = map[string]interface{}{}
		if len(payload) > 0 {
			if err := json.Unmarshal(payload, &item.Data); err != nil {
				return nil, err
			}
		}
		results = append(results, item)
	}

	return results, nil
}

func (r *PostgresRepository) MarkInAppNotificationRead(ctx context.Context, userID uuid.UUID, notificationID uuid.UUID) (bool, error) {
	query := `
        UPDATE in_app_notifications
        SET
            status = 'read',
            read_at = COALESCE(read_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
          AND user_id = $2
    `
	tag, err := r.db.Exec(ctx, query, notificationID, userID)
	if err != nil {
		return false, err
	}
	return tag.RowsAffected() > 0, nil
}

func (r *PostgresRepository) MarkAllInAppNotificationsRead(ctx context.Context, userID uuid.UUID, category *string) (int64, error) {
	query := `
        UPDATE in_app_notifications
        SET
            status = 'read',
            read_at = COALESCE(read_at, NOW()),
            updated_at = NOW()
        WHERE user_id = $1
          AND status = 'unread'
    `
	args := []interface{}{userID}
	if category != nil && strings.TrimSpace(*category) != "" {
		query += " AND category = $2"
		args = append(args, strings.ToLower(strings.TrimSpace(*category)))
	}

	tag, err := r.db.Exec(ctx, query, args...)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (r *PostgresRepository) GetInAppNotificationUnreadCounts(ctx context.Context, userID uuid.UUID) (*domain.NotificationUnreadCounts, error) {
	query := `
        SELECT
            COUNT(*) FILTER (WHERE status = 'unread') AS total,
            COUNT(*) FILTER (WHERE status = 'unread' AND category = 'request') AS request_count,
            COUNT(*) FILTER (WHERE status = 'unread' AND category = 'newsletter') AS newsletter_count,
            COUNT(*) FILTER (WHERE status = 'unread' AND category = 'system') AS system_count
        FROM in_app_notifications
        WHERE user_id = $1
    `

	var counts domain.NotificationUnreadCounts
	if err := r.db.QueryRow(ctx, query, userID).Scan(
		&counts.Total,
		&counts.Request,
		&counts.Newsletter,
		&counts.System,
	); err != nil {
		return nil, err
	}
	return &counts, nil
}

// Money Drop Implementations

// FindMoneyDropAccountByUserID retrieves the money drop account for a user.
func (r *PostgresRepository) FindMoneyDropAccountByUserID(ctx context.Context, userID uuid.UUID) (*domain.Account, error) {
	var account domain.Account
	query := `
		SELECT id, user_id, anchor_account_id, balance
		FROM accounts
		WHERE user_id = $1 AND account_type = 'money_drop'
	`
	err := r.db.QueryRow(ctx, query, userID).Scan(
		&account.ID, &account.UserID, &account.AnchorAccountID, &account.Balance)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrAccountNotFound
		}
		return nil, err
	}
	return &account, nil
}

// CreateAccount creates a new account in the database.
// Note: This method creates a money_drop account type.
func (r *PostgresRepository) CreateAccount(ctx context.Context, account *domain.Account) (*domain.Account, error) {
	query := `
		INSERT INTO accounts (user_id, anchor_account_id, virtual_nuban, account_type, balance, status)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`
	err := r.db.QueryRow(ctx, query,
		account.UserID, account.AnchorAccountID, "", "money_drop", account.Balance, "active",
	).Scan(&account.ID)
	if err != nil {
		return nil, err
	}
	return account, nil
}

// CreateMoneyDrop creates a new money drop record in the database.
func (r *PostgresRepository) CreateMoneyDrop(ctx context.Context, drop *domain.MoneyDrop) (*domain.MoneyDrop, error) {
	query := `
		INSERT INTO money_drops (
			creator_id, status, amount_per_claim, total_claims_allowed,
			claims_made_count, expiry_timestamp, funding_source_account_id, money_drop_account_id
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at
	`
	err := r.db.QueryRow(ctx, query,
		drop.CreatorID, drop.Status, drop.AmountPerClaim, drop.TotalClaimsAllowed,
		drop.ClaimsMadeCount, drop.ExpiryTimestamp, drop.FundingSourceAccountID, drop.MoneyDropAccountID,
	).Scan(&drop.ID, &drop.CreatedAt)
	if err != nil {
		return nil, err
	}
	return drop, nil
}

// FindMoneyDropByID retrieves a money drop by its ID.
func (r *PostgresRepository) FindMoneyDropByID(ctx context.Context, dropID uuid.UUID) (*domain.MoneyDrop, error) {
	var drop domain.MoneyDrop
	query := `
		SELECT id, creator_id, status, amount_per_claim, total_claims_allowed,
		       claims_made_count, expiry_timestamp, funding_source_account_id,
		       money_drop_account_id, created_at
		FROM money_drops
		WHERE id = $1
	`
	err := r.db.QueryRow(ctx, query, dropID).Scan(
		&drop.ID, &drop.CreatorID, &drop.Status, &drop.AmountPerClaim,
		&drop.TotalClaimsAllowed, &drop.ClaimsMadeCount, &drop.ExpiryTimestamp,
		&drop.FundingSourceAccountID, &drop.MoneyDropAccountID, &drop.CreatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, errors.New("money drop not found")
		}
		return nil, err
	}
	return &drop, nil
}

// FindMoneyDropCreatorByDropID retrieves the creator of a money drop.
func (r *PostgresRepository) FindMoneyDropCreatorByDropID(ctx context.Context, dropID uuid.UUID) (*domain.User, error) {
	var user domain.User
	query := `
		SELECT u.id, btrim(u.username) AS username, u.allow_sending, u.anchor_customer_id
		FROM users u
		INNER JOIN money_drops md ON u.id = md.creator_id
		WHERE md.id = $1
	`
	err := r.db.QueryRow(ctx, query, dropID).Scan(
		&user.ID, &user.Username, &user.AllowSending, &user.AnchorCustomerID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &user, nil
}

// ClaimMoneyDropAtomic performs an atomic claim operation on a money drop.
func (r *PostgresRepository) ClaimMoneyDropAtomic(ctx context.Context, dropID, claimantID, claimantAccountID, moneyDropAccountID uuid.UUID, amount int64) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// 1. Lock the money_drops row and validate the claim
	var claimsMade, totalAllowed int
	var status string
	var expiry time.Time
	query := `
		SELECT claims_made_count, total_claims_allowed, status, expiry_timestamp
		FROM money_drops
		WHERE id = $1
		FOR UPDATE
	`
	err = tx.QueryRow(ctx, query, dropID).Scan(&claimsMade, &totalAllowed, &status, &expiry)
	if err != nil {
		return fmt.Errorf("failed to get and lock money drop: %w", err)
	}

	if status != "active" {
		return errors.New("money drop is not active")
	}
	if time.Now().After(expiry) {
		return errors.New("money drop has expired")
	}
	if claimsMade >= totalAllowed {
		return errors.New("money drop has been fully claimed")
	}

	// 2. Check if this user has already claimed
	var claimCount int
	claimCheckQuery := `
		SELECT COUNT(*)
		FROM money_drop_claims
		WHERE drop_id = $1 AND claimant_id = $2
	`
	err = tx.QueryRow(ctx, claimCheckQuery, dropID, claimantID).Scan(&claimCount)
	if err != nil {
		return fmt.Errorf("failed to check existing claims: %w", err)
	}
	if claimCount > 0 {
		return errors.New("you have already claimed this money drop")
	}

	// 3. Update the money_drops table
	updateQuery := `
		UPDATE money_drops
		SET claims_made_count = claims_made_count + 1
		WHERE id = $1
	`
	_, err = tx.Exec(ctx, updateQuery, dropID)
	if err != nil {
		return fmt.Errorf("failed to update money drop claim count: %w", err)
	}

	// 4. Insert into money_drop_claims table
	insertClaimQuery := `
		INSERT INTO money_drop_claims (drop_id, claimant_id, claimed_at)
		VALUES ($1, $2, NOW())
	`
	_, err = tx.Exec(ctx, insertClaimQuery, dropID, claimantID)
	if err != nil {
		return fmt.Errorf("failed to insert claim record: %w", err)
	}

	// 5. Log the transaction within the same DB transaction for consistency
	logTxQuery := `
		INSERT INTO transactions (
			sender_id, recipient_id, source_account_id, destination_account_id,
			type, category, status, amount, fee, description
		)
		SELECT creator_id, $1, $2, $3, 'money_drop_claim', 'Money Drop', 'pending', $4, 0, 'Money Drop Claim'
		FROM money_drops
		WHERE id = $5
	`
	_, err = tx.Exec(ctx, logTxQuery, claimantID, moneyDropAccountID, claimantAccountID, amount, dropID)
	if err != nil {
		return fmt.Errorf("failed to log money drop claim transaction: %w", err)
	}

	return tx.Commit(ctx)
}

// FindExpiredAndCompletedMoneyDrops finds all expired or fully claimed money drops.
func (r *PostgresRepository) FindExpiredAndCompletedMoneyDrops(ctx context.Context) ([]domain.MoneyDrop, error) {
	var drops []domain.MoneyDrop
	query := `
		SELECT id, creator_id, amount_per_claim, total_claims_allowed,
		       claims_made_count, expiry_timestamp, funding_source_account_id,
		       money_drop_account_id, created_at
		FROM money_drops
		WHERE status = 'active'
		  AND (expiry_timestamp <= NOW() OR claims_made_count >= total_claims_allowed)
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var drop domain.MoneyDrop
		err := rows.Scan(
			&drop.ID, &drop.CreatorID, &drop.AmountPerClaim, &drop.TotalClaimsAllowed,
			&drop.ClaimsMadeCount, &drop.ExpiryTimestamp, &drop.FundingSourceAccountID,
			&drop.MoneyDropAccountID, &drop.CreatedAt)
		if err != nil {
			return nil, err
		}
		drop.Status = "active" // Will be updated by scheduler
		drops = append(drops, drop)
	}

	return drops, nil
}

// UpdateMoneyDropStatus updates the status of a money drop.
func (r *PostgresRepository) UpdateMoneyDropStatus(ctx context.Context, dropID uuid.UUID, status string) error {
	query := `UPDATE money_drops SET status = $1 WHERE id = $2`
	_, err := r.db.Exec(ctx, query, status, dropID)
	return err
}

// UpdateMoneyDropAccountBalance updates the balance for a money drop account by account ID.
func (r *PostgresRepository) UpdateMoneyDropAccountBalance(ctx context.Context, accountID uuid.UUID, balance int64) error {
	query := `UPDATE accounts SET balance = $1, updated_at = NOW() WHERE id = $2 AND account_type = 'money_drop'`
	result, err := r.db.Exec(ctx, query, balance, accountID)
	if err != nil {
		return err
	}

	rowsAffected := result.RowsAffected()
	if rowsAffected == 0 {
		return ErrAccountNotFound
	}

	return nil
}

func (r *PostgresRepository) CreateTransferList(ctx context.Context, list *domain.TransferList, memberIDs []uuid.UUID) (*domain.TransferList, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	insertListQuery := `
		INSERT INTO transfer_lists (id, owner_id, name)
		VALUES ($1, $2, $3)
		RETURNING created_at, updated_at
	`
	if err := tx.QueryRow(ctx, insertListQuery, list.ID, list.OwnerID, list.Name).Scan(&list.CreatedAt, &list.UpdatedAt); err != nil {
		return nil, err
	}

	if len(memberIDs) > 0 {
		insertMemberQuery := `
			INSERT INTO transfer_list_members (list_id, member_user_id)
			VALUES ($1, $2)
		`
		for _, memberID := range memberIDs {
			if _, err := tx.Exec(ctx, insertMemberQuery, list.ID, memberID); err != nil {
				return nil, err
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return r.GetTransferListByID(ctx, list.OwnerID, list.ID)
}

func (r *PostgresRepository) ListTransferListsByOwner(ctx context.Context, ownerID uuid.UUID, opts domain.TransferListListOptions) ([]domain.TransferListSummary, error) {
	limit := opts.Limit
	if limit <= 0 {
		limit = 30
	}
	if limit > 100 {
		limit = 100
	}
	offset := opts.Offset
	if offset < 0 {
		offset = 0
	}

	query := `
		SELECT
			l.id,
			l.owner_id,
			l.name,
			COUNT(m.member_user_id)::int AS member_count,
			COALESCE(
				array_remove(array_agg(btrim(u.username) ORDER BY lower(btrim(u.username))), NULL),
				ARRAY[]::text[]
			) AS member_usernames,
			l.created_at,
			l.updated_at
		FROM transfer_lists l
		LEFT JOIN transfer_list_members m ON m.list_id = l.id
		LEFT JOIN users u ON u.id = m.member_user_id
		WHERE l.owner_id = $1
		  AND l.deleted_at IS NULL
		  AND ($2 = '' OR lower(l.name) LIKE '%' || lower($2) || '%')
		GROUP BY l.id
		ORDER BY l.updated_at DESC
		LIMIT $3 OFFSET $4
	`

	rows, err := r.db.Query(ctx, query, ownerID, strings.TrimSpace(opts.Search), limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	results := make([]domain.TransferListSummary, 0, limit)
	for rows.Next() {
		var item domain.TransferListSummary
		if err := rows.Scan(
			&item.ID,
			&item.OwnerID,
			&item.Name,
			&item.MemberCount,
			&item.MemberUsernames,
			&item.CreatedAt,
			&item.UpdatedAt,
		); err != nil {
			return nil, err
		}
		results = append(results, item)
	}
	return results, rows.Err()
}

func (r *PostgresRepository) GetTransferListByID(ctx context.Context, ownerID uuid.UUID, listID uuid.UUID) (*domain.TransferList, error) {
	query := `
		SELECT id, owner_id, name, created_at, updated_at
		FROM transfer_lists
		WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
	`

	var result domain.TransferList
	if err := r.db.QueryRow(ctx, query, listID, ownerID).Scan(
		&result.ID,
		&result.OwnerID,
		&result.Name,
		&result.CreatedAt,
		&result.UpdatedAt,
	); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrTransferListNotFound
		}
		return nil, err
	}

	memberQuery := `
		SELECT u.id, btrim(u.username) AS username, u.full_name, m.created_at
		FROM transfer_list_members m
		JOIN users u ON u.id = m.member_user_id
		WHERE m.list_id = $1
		ORDER BY lower(btrim(u.username)) ASC
	`
	rows, err := r.db.Query(ctx, memberQuery, listID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := make([]domain.TransferListMember, 0, 10)
	for rows.Next() {
		var item domain.TransferListMember
		if err := rows.Scan(&item.UserID, &item.Username, &item.FullName, &item.CreatedAt); err != nil {
			return nil, err
		}
		members = append(members, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	result.Members = members
	result.MemberCount = len(members)
	return &result, nil
}

func (r *PostgresRepository) UpdateTransferList(ctx context.Context, ownerID uuid.UUID, listID uuid.UUID, name string, memberIDs []uuid.UUID) (*domain.TransferList, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	updateListQuery := `
		UPDATE transfer_lists
		SET name = $1, updated_at = NOW()
		WHERE id = $2 AND owner_id = $3 AND deleted_at IS NULL
	`
	updateResult, err := tx.Exec(ctx, updateListQuery, name, listID, ownerID)
	if err != nil {
		return nil, err
	}
	if updateResult.RowsAffected() == 0 {
		return nil, ErrTransferListNotFound
	}

	if _, err := tx.Exec(ctx, `DELETE FROM transfer_list_members WHERE list_id = $1`, listID); err != nil {
		return nil, err
	}

	if len(memberIDs) > 0 {
		insertMemberQuery := `
			INSERT INTO transfer_list_members (list_id, member_user_id)
			VALUES ($1, $2)
		`
		for _, memberID := range memberIDs {
			if _, err := tx.Exec(ctx, insertMemberQuery, listID, memberID); err != nil {
				return nil, err
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	return r.GetTransferListByID(ctx, ownerID, listID)
}

func (r *PostgresRepository) DeleteTransferList(ctx context.Context, ownerID uuid.UUID, listID uuid.UUID) (bool, error) {
	query := `
		UPDATE transfer_lists
		SET deleted_at = NOW(), updated_at = NOW()
		WHERE id = $1 AND owner_id = $2 AND deleted_at IS NULL
	`
	result, err := r.db.Exec(ctx, query, listID, ownerID)
	if err != nil {
		return false, err
	}
	return result.RowsAffected() > 0, nil
}
