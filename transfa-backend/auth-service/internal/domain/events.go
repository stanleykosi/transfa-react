package domain

type Tier2VerificationRequestedEvent struct {
	UserID           string `json:"user_id"`
	AnchorCustomerID string `json:"anchor_customer_id"`
	BVN              string `json:"bvn"`
	DateOfBirth      string `json:"date_of_birth"`
	Gender           string `json:"gender"`
}

type Tier1ProfileUpdateRequestedEvent struct {
	UserID           string                 `json:"user_id"`
	AnchorCustomerID string                 `json:"anchor_customer_id"`
	KYCData          map[string]interface{} `json:"kyc_data"`
}
