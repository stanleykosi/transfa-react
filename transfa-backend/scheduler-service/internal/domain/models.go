/**
 * @description
 * Domain models used by the scheduler-service.
 */
package domain

// MoneyDrop represents the data needed by the scheduler service
// to process expired or completed money drops.
type MoneyDrop struct {
	ID                     string `json:"id"`
	CreatorID              string `json:"creator_id"`
	TotalAmount            int64  `json:"total_amount"`
	AmountPerClaim         int64  `json:"amount_per_claim"`
	TotalClaimsAllowed     int    `json:"total_claims_allowed"`
	ClaimsMadeCount        int    `json:"claims_made_count"`
	FundingSourceAccountID string `json:"funding_source_account_id"`
	MoneyDropAccountID     string `json:"money_drop_account_id"`
}

// RefundPayload defines the structure for the money drop refund request.
type RefundPayload struct {
	DropID    string `json:"drop_id"`
	CreatorID string `json:"creator_id"`
	Amount    int64  `json:"amount"`
}
