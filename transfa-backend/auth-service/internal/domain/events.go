package domain

type Tier2VerificationRequestedEvent struct {
	UserID           string `json:"user_id"`
	AnchorCustomerID string `json:"anchor_customer_id"`
	BVN              string `json:"bvn"`
	DateOfBirth      string `json:"date_of_birth"`
	Gender           string `json:"gender"`
}

type Tier3VerificationRequestedEvent struct {
	UserID           string `json:"user_id"`
	AnchorCustomerID string `json:"anchor_customer_id"`
	IDType           string `json:"id_type"`
	IDNumber         string `json:"id_number"`
	ExpiryDate       string `json:"expiry_date"`
}

type Tier1ProfileUpdateRequestedEvent struct {
	UserID           string                 `json:"user_id"`
	AnchorCustomerID string                 `json:"anchor_customer_id"`
	KYCData          map[string]interface{} `json:"kyc_data"`
}
