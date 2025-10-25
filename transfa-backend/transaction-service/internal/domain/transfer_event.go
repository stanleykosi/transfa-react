package domain

import "time"

// TransferStatusEvent represents the message emitted by the notification-service for transfer lifecycle updates.
type TransferStatusEvent struct {
    EventID          string    `json:"event_id"`
    EventType        string    `json:"event_type"`
    Status           string    `json:"status"`
    TransferType     string    `json:"transfer_type"`
    AnchorTransferID string    `json:"anchor_transfer_id"`
    AnchorAccountID  string    `json:"anchor_account_id"`
    AnchorCustomerID string    `json:"anchor_customer_id"`
    CounterpartyID   string    `json:"counterparty_id"`
    Amount           int64     `json:"amount"`
    Currency         string    `json:"currency"`
    Reason           string    `json:"reason"`
    SessionID        string    `json:"session_id"`
    OccurredAt       time.Time `json:"occurred_at"`
}
