/**
 * @description
 * Domain models for platform fee billing.
 */
package domain

import "time"

// PlatformFeeInvoice represents a platform fee invoice row.
type PlatformFeeInvoice struct {
	ID            string     `json:"id"`
	UserID        string     `json:"user_id"`
	UserType      string     `json:"user_type"`
	PeriodStart   time.Time  `json:"period_start"`
	PeriodEnd     time.Time  `json:"period_end"`
	DueAt         time.Time  `json:"due_at"`
	GraceUntil    time.Time  `json:"grace_until"`
	Amount        int64      `json:"amount"`
	Currency      string     `json:"currency"`
	Status        string     `json:"status"`
	PaidAt        *time.Time `json:"paid_at,omitempty"`
	LastAttemptAt *time.Time `json:"last_attempt_at,omitempty"`
	RetryCount    int        `json:"retry_count"`
	FailureReason *string    `json:"failure_reason,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// PlatformFeeAttempt represents an audit record for a charge attempt.
type PlatformFeeAttempt struct {
	ID                string     `json:"id"`
	InvoiceID         string     `json:"invoice_id"`
	AttemptedAt       time.Time  `json:"attempted_at"`
	Amount            int64      `json:"amount"`
	Status            string     `json:"status"`
	FailureReason     *string    `json:"failure_reason,omitempty"`
	ProviderReference *string    `json:"provider_reference,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
}

// PlatformFeeStatus summarizes a user's current platform fee state.
type PlatformFeeStatus struct {
	Status        string     `json:"status"`
	PeriodStart   *time.Time `json:"period_start,omitempty"`
	PeriodEnd     *time.Time `json:"period_end,omitempty"`
	DueAt         *time.Time `json:"due_at,omitempty"`
	GraceUntil    *time.Time `json:"grace_until,omitempty"`
	Amount        int64      `json:"amount,omitempty"`
	Currency      string     `json:"currency,omitempty"`
	RetryCount    int        `json:"retry_count,omitempty"`
	LastAttemptAt *time.Time `json:"last_attempt_at,omitempty"`
	IsDelinquent  bool       `json:"is_delinquent"`
	IsWithinGrace bool       `json:"is_within_grace"`
}
