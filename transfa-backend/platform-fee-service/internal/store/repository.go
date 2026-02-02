/**
 * @description
 * Data access layer for the platform-fee service.
 */
package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/transfa/platform-fee-service/internal/domain"
)

var (
	ErrInvoiceNotFound = errors.New("invoice not found")
	ErrUserNotFound    = errors.New("user not found")
)

// Repository handles database operations for platform fees.
type Repository struct {
	db *pgxpool.Pool
}

// NewRepository creates a new repository.
func NewRepository(db *pgxpool.Pool) *Repository {
	return &Repository{db: db}
}

// FindUserIDByClerkUserID resolves the internal UUID from a Clerk user id string.
func (r *Repository) FindUserIDByClerkUserID(ctx context.Context, clerkUserID string) (string, error) {
	var id string
	err := r.db.QueryRow(ctx, "SELECT id FROM users WHERE clerk_user_id = $1", clerkUserID).Scan(&id)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", ErrUserNotFound
		}
		return "", err
	}
	return id, nil
}

// GenerateInvoicesForPeriod creates invoices for all users for the given period.
func (r *Repository) GenerateInvoicesForPeriod(ctx context.Context, periodStart, periodEnd, dueAt, graceUntil time.Time) ([]domain.PlatformFeeInvoice, error) {
	query := `
		INSERT INTO platform_fee_invoices (
			user_id,
			user_type,
			period_start,
			period_end,
			due_at,
			grace_until,
			amount,
			currency
		)
		SELECT
			u.id,
			u.user_type,
			$1::DATE,
			$2::DATE,
			$3,
			$4,
			cfg.fee_amount,
			cfg.currency
		FROM users u
		JOIN LATERAL (
			SELECT fee_amount, currency
			FROM platform_fee_config
			WHERE user_type = u.user_type
			  AND active = TRUE
			  AND effective_from <= $1::DATE
			ORDER BY effective_from DESC
			LIMIT 1
		) cfg ON TRUE
		ON CONFLICT (user_id, period_start) DO NOTHING
		RETURNING id, user_id, user_type, period_start, period_end, due_at, grace_until,
		          amount, currency, status, paid_at, last_attempt_at, retry_count, failure_reason,
		          created_at, updated_at
	`
	rows, err := r.db.Query(ctx, query, periodStart, periodEnd, dueAt, graceUntil)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invoices []domain.PlatformFeeInvoice
	for rows.Next() {
		var invoice domain.PlatformFeeInvoice
		if err := rows.Scan(
			&invoice.ID,
			&invoice.UserID,
			&invoice.UserType,
			&invoice.PeriodStart,
			&invoice.PeriodEnd,
			&invoice.DueAt,
			&invoice.GraceUntil,
			&invoice.Amount,
			&invoice.Currency,
			&invoice.Status,
			&invoice.PaidAt,
			&invoice.LastAttemptAt,
			&invoice.RetryCount,
			&invoice.FailureReason,
			&invoice.CreatedAt,
			&invoice.UpdatedAt,
		); err != nil {
			return nil, err
		}
		invoices = append(invoices, invoice)
	}

	return invoices, nil
}

// ListInvoicesByUserID retrieves recent invoices for a user.
func (r *Repository) ListInvoicesByUserID(ctx context.Context, userID string, limit int) ([]domain.PlatformFeeInvoice, error) {
	query := `
		SELECT id, user_id, user_type, period_start, period_end, due_at, grace_until,
		       amount, currency, status, paid_at, last_attempt_at, retry_count, failure_reason,
		       created_at, updated_at
		FROM platform_fee_invoices
		WHERE user_id = $1
		ORDER BY period_start DESC
		LIMIT $2
	`
	rows, err := r.db.Query(ctx, query, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invoices []domain.PlatformFeeInvoice
	for rows.Next() {
		var invoice domain.PlatformFeeInvoice
		if err := rows.Scan(
			&invoice.ID,
			&invoice.UserID,
			&invoice.UserType,
			&invoice.PeriodStart,
			&invoice.PeriodEnd,
			&invoice.DueAt,
			&invoice.GraceUntil,
			&invoice.Amount,
			&invoice.Currency,
			&invoice.Status,
			&invoice.PaidAt,
			&invoice.LastAttemptAt,
			&invoice.RetryCount,
			&invoice.FailureReason,
			&invoice.CreatedAt,
			&invoice.UpdatedAt,
		); err != nil {
			return nil, err
		}
		invoices = append(invoices, invoice)
	}

	return invoices, nil
}

// GetLatestInvoiceByUserID retrieves the most recent invoice for a user.
func (r *Repository) GetLatestInvoiceByUserID(ctx context.Context, userID string) (*domain.PlatformFeeInvoice, error) {
	query := `
		SELECT id, user_id, user_type, period_start, period_end, due_at, grace_until,
		       amount, currency, status, paid_at, last_attempt_at, retry_count, failure_reason,
		       created_at, updated_at
		FROM platform_fee_invoices
		WHERE user_id = $1
		ORDER BY period_start DESC
		LIMIT 1
	`
	var invoice domain.PlatformFeeInvoice
	if err := r.db.QueryRow(ctx, query, userID).Scan(
		&invoice.ID,
		&invoice.UserID,
		&invoice.UserType,
		&invoice.PeriodStart,
		&invoice.PeriodEnd,
		&invoice.DueAt,
		&invoice.GraceUntil,
		&invoice.Amount,
		&invoice.Currency,
		&invoice.Status,
		&invoice.PaidAt,
		&invoice.LastAttemptAt,
		&invoice.RetryCount,
		&invoice.FailureReason,
		&invoice.CreatedAt,
		&invoice.UpdatedAt,
	); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrInvoiceNotFound
		}
		return nil, err
	}

	return &invoice, nil
}

// GetInvoiceByID retrieves a specific invoice.
func (r *Repository) GetInvoiceByID(ctx context.Context, invoiceID string) (*domain.PlatformFeeInvoice, error) {
	query := `
		SELECT id, user_id, user_type, period_start, period_end, due_at, grace_until,
		       amount, currency, status, paid_at, last_attempt_at, retry_count, failure_reason,
		       created_at, updated_at
		FROM platform_fee_invoices
		WHERE id = $1
	`
	var invoice domain.PlatformFeeInvoice
	if err := r.db.QueryRow(ctx, query, invoiceID).Scan(
		&invoice.ID,
		&invoice.UserID,
		&invoice.UserType,
		&invoice.PeriodStart,
		&invoice.PeriodEnd,
		&invoice.DueAt,
		&invoice.GraceUntil,
		&invoice.Amount,
		&invoice.Currency,
		&invoice.Status,
		&invoice.PaidAt,
		&invoice.LastAttemptAt,
		&invoice.RetryCount,
		&invoice.FailureReason,
		&invoice.CreatedAt,
		&invoice.UpdatedAt,
	); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrInvoiceNotFound
		}
		return nil, err
	}

	return &invoice, nil
}

// ListChargeableInvoices fetches invoices that are due and within grace.
func (r *Repository) ListChargeableInvoices(ctx context.Context, now time.Time) ([]domain.PlatformFeeInvoice, error) {
	query := `
		SELECT id, user_id, user_type, period_start, period_end, due_at, grace_until,
		       amount, currency, status, paid_at, last_attempt_at, retry_count, failure_reason,
		       created_at, updated_at
		FROM platform_fee_invoices
		WHERE status IN ('pending', 'failed')
		  AND due_at <= $1
		  AND grace_until >= $1
		  AND NOT EXISTS (
			SELECT 1
			FROM platform_fee_attempts
			WHERE invoice_id = platform_fee_invoices.id
			  AND status = 'success'
		  )
		ORDER BY due_at ASC
	`
	rows, err := r.db.Query(ctx, query, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invoices []domain.PlatformFeeInvoice
	for rows.Next() {
		var invoice domain.PlatformFeeInvoice
		if err := rows.Scan(
			&invoice.ID,
			&invoice.UserID,
			&invoice.UserType,
			&invoice.PeriodStart,
			&invoice.PeriodEnd,
			&invoice.DueAt,
			&invoice.GraceUntil,
			&invoice.Amount,
			&invoice.Currency,
			&invoice.Status,
			&invoice.PaidAt,
			&invoice.LastAttemptAt,
			&invoice.RetryCount,
			&invoice.FailureReason,
			&invoice.CreatedAt,
			&invoice.UpdatedAt,
		); err != nil {
			return nil, err
		}
		invoices = append(invoices, invoice)
	}

	return invoices, nil
}

// ClaimInvoiceAttempt updates an invoice for a new attempt if allowed.
func (r *Repository) ClaimInvoiceAttempt(ctx context.Context, invoiceID string, attemptAt time.Time, attemptWindowStart time.Time) (*domain.PlatformFeeInvoice, error) {
	query := `
		UPDATE platform_fee_invoices
		SET last_attempt_at = $1,
		    retry_count = retry_count + 1,
		    updated_at = NOW()
		WHERE id = $2
		  AND status IN ('pending', 'failed')
		  AND NOT EXISTS (
			SELECT 1
			FROM platform_fee_attempts
			WHERE invoice_id = platform_fee_invoices.id
			  AND status = 'success'
		  )
		  AND (last_attempt_at IS NULL OR last_attempt_at < $3)
		RETURNING id, user_id, user_type, period_start, period_end, due_at, grace_until,
		          amount, currency, status, paid_at, last_attempt_at, retry_count, failure_reason,
		          created_at, updated_at
	`
	var invoice domain.PlatformFeeInvoice
	if err := r.db.QueryRow(ctx, query, attemptAt, invoiceID, attemptWindowStart).Scan(
		&invoice.ID,
		&invoice.UserID,
		&invoice.UserType,
		&invoice.PeriodStart,
		&invoice.PeriodEnd,
		&invoice.DueAt,
		&invoice.GraceUntil,
		&invoice.Amount,
		&invoice.Currency,
		&invoice.Status,
		&invoice.PaidAt,
		&invoice.LastAttemptAt,
		&invoice.RetryCount,
		&invoice.FailureReason,
		&invoice.CreatedAt,
		&invoice.UpdatedAt,
	); err != nil {
		if err == pgx.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	return &invoice, nil
}

// InsertAttempt writes a platform fee attempt record.
func (r *Repository) InsertAttempt(ctx context.Context, invoiceID string, amount int64, status string, failureReason, providerRef *string) error {
	query := `
		INSERT INTO platform_fee_attempts (invoice_id, amount, status, failure_reason, provider_reference)
		VALUES ($1, $2, $3, $4, $5)
	`
	_, err := r.db.Exec(ctx, query, invoiceID, amount, status, failureReason, providerRef)
	return err
}

// HasSuccessfulAttempt checks if an invoice already has a successful attempt.
func (r *Repository) HasSuccessfulAttempt(ctx context.Context, invoiceID string) (bool, error) {
	query := `
		SELECT EXISTS (
			SELECT 1
			FROM platform_fee_attempts
			WHERE invoice_id = $1
			  AND status = 'success'
		)
	`
	var exists bool
	if err := r.db.QueryRow(ctx, query, invoiceID).Scan(&exists); err != nil {
		return false, err
	}
	return exists, nil
}

// MarkInvoicePaid marks an invoice as paid.
func (r *Repository) MarkInvoicePaid(ctx context.Context, invoiceID string, paidAt time.Time) error {
	query := `
		UPDATE platform_fee_invoices
		SET status = 'paid',
		    paid_at = $2,
		    failure_reason = NULL,
		    updated_at = NOW()
		WHERE id = $1
	`
	_, err := r.db.Exec(ctx, query, invoiceID, paidAt)
	return err
}

// MarkInvoiceFailed marks an invoice as failed and stores the failure reason.
func (r *Repository) MarkInvoiceFailed(ctx context.Context, invoiceID string, failureReason string) error {
	query := `
		UPDATE platform_fee_invoices
		SET status = 'failed',
		    failure_reason = $2,
		    updated_at = NOW()
		WHERE id = $1
	`
	_, err := r.db.Exec(ctx, query, invoiceID, failureReason)
	return err
}

// MarkInvoicesDelinquent updates invoices past grace period.
func (r *Repository) MarkInvoicesDelinquent(ctx context.Context, now time.Time) ([]domain.PlatformFeeInvoice, error) {
	query := `
		UPDATE platform_fee_invoices
		SET status = 'delinquent',
		    updated_at = NOW()
		WHERE status IN ('pending', 'failed')
		  AND grace_until < $1
		  AND NOT EXISTS (
			SELECT 1
			FROM platform_fee_attempts
			WHERE invoice_id = platform_fee_invoices.id
			  AND status = 'success'
		  )
		RETURNING id, user_id, user_type, period_start, period_end, due_at, grace_until,
		          amount, currency, status, paid_at, last_attempt_at, retry_count, failure_reason,
		          created_at, updated_at
	`
	rows, err := r.db.Query(ctx, query, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var invoices []domain.PlatformFeeInvoice
	for rows.Next() {
		var invoice domain.PlatformFeeInvoice
		if err := rows.Scan(
			&invoice.ID,
			&invoice.UserID,
			&invoice.UserType,
			&invoice.PeriodStart,
			&invoice.PeriodEnd,
			&invoice.DueAt,
			&invoice.GraceUntil,
			&invoice.Amount,
			&invoice.Currency,
			&invoice.Status,
			&invoice.PaidAt,
			&invoice.LastAttemptAt,
			&invoice.RetryCount,
			&invoice.FailureReason,
			&invoice.CreatedAt,
			&invoice.UpdatedAt,
		); err != nil {
			return nil, err
		}
		invoices = append(invoices, invoice)
	}

	return invoices, nil
}
