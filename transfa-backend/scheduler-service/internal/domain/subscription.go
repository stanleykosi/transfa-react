/**
 * @description
 * This file defines the core domain models needed by the scheduler-service.
 */
package domain


// Subscription represents a user's subscription details relevant to the scheduler.
type Subscription struct {
	ID     string `json:"id"`
	UserID string `json:"user_id"`
	Status string `json:"status"`
}

// TransactionPayload defines the structure for the request to the transaction-service.
type TransactionPayload struct {
	UserID string `json:"user_id"`
	Amount int64  `json:"amount"`
	Reason string `json:"reason"`
}
