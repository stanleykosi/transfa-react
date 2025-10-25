package domain

import "time"

// TransferStatusEvent represents the payload broadcast internally when Anchor
// notifies us about a transfer lifecycle change (book or NIP).
type TransferStatusEvent struct {
	EventID          string    `json:"event_id"`
	EventType        string    `json:"event_type"`
	Status           string    `json:"status"`
	TransferType     string    `json:"transfer_type"`
	AnchorTransferID string    `json:"anchor_transfer_id"`
	AnchorAccountID  string    `json:"anchor_account_id,omitempty"`
	AnchorCustomerID string    `json:"anchor_customer_id,omitempty"`
	CounterpartyID   string    `json:"counterparty_id,omitempty"`
	Amount           int64     `json:"amount,omitempty"`
	Currency         string    `json:"currency,omitempty"`
	Reason           string    `json:"reason,omitempty"`
	SessionID        string    `json:"session_id,omitempty"`
	OccurredAt       time.Time `json:"occurred_at"`
}

