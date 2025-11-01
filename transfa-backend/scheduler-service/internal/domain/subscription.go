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

// MoneyDrop represents the data needed by the scheduler service
// to process expired or completed money drops.
type MoneyDrop struct {
	ID                   string `json:"id"`
	CreatorID            string `json:"creator_id"`
	AmountPerClaim       int64  `json:"amount_per_claim"`
	TotalClaimsAllowed   int    `json:"total_claims_allowed"`
	ClaimsMadeCount      int    `json:"claims_made_count"`
	FundingSourceAccountID string `json:"funding_source_account_id"`
	MoneyDropAccountID   string `json:"money_drop_account_id"`
}

// RefundPayload defines the structure for the money drop refund request.
type RefundPayload struct {
	DropID    string `json:"drop_id"`
	CreatorID string `json:"creator_id"`
	Amount    int64  `json:"amount"`
}
