package domain

type Tier2VerificationRequestedEvent struct {
	UserID           string `json:"user_id"`
	AnchorCustomerID string `json:"anchor_customer_id"`
	BVN              string `json:"bvn"`
	DateOfBirth      string `json:"date_of_birth"`
	Gender           string `json:"gender"`
}
