package domain

import "time"

// UserSecurityCredential stores backend-managed PIN security metadata for a user.
type UserSecurityCredential struct {
	UserID             string     `json:"user_id"`
	TransactionPINHash string     `json:"transaction_pin_hash"`
	FailedAttempts     int        `json:"failed_attempts"`
	LockedUntil        *time.Time `json:"locked_until,omitempty"`
}
