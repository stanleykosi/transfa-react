/**
 * @description
 * This file defines the Go structs that map to the JSON:API specification
 * used by the Anchor BaaS platform. These models are used to construct request
 * bodies and parse responses when communicating with the Anchor API.
 *
 * @dependencies
 * - None. These are plain Go structs.
 *
 * @notes
 * - The `json:"..."` tags are crucial for correct serialization and deserialization
 *   of JSON data.
 * - These structs are based on the Anchor API documentation provided in the project.
 */
package domain

// --- Generic JSON:API Structures ---

// RequestData is a generic container for a JSON:API request payload.
type RequestData struct {
	Type       string      `json:"type"`
	Attributes interface{} `json:"attributes"`
}

// ResponseData is a generic container for a JSON:API response payload.
type ResponseData struct {
	ID         string      `json:"id"`
	Type       string      `json:"type"`
	Attributes interface{} `json:"attributes"`
}

// --- Create Individual Customer ---

// AnchorCreateIndividualCustomerRequest is the top-level request structure for creating a customer.
type AnchorCreateIndividualCustomerRequest struct {
	Data RequestData `json:"data"`
}

// IndividualCustomerAttributes defines the attributes for creating a new individual customer.
type IndividualCustomerAttributes struct {
	FullName    FullName `json:"fullName"`
	Address     Address  `json:"address"`
	Email       string   `json:"email"`
	PhoneNumber string   `json:"phoneNumber"`
}

// AnchorIndividualCustomerResponse is the top-level response structure after creating a customer.
type AnchorIndividualCustomerResponse struct {
	Data ResponseData `json:"data"`
}

// --- Shared Sub-structures ---

// FullName represents a person's full name.
type FullName struct {
	FirstName  string `json:"firstName"`
	LastName   string `json:"lastName,omitempty"`
	MiddleName string `json:"middleName,omitempty"`
	MaidenName string `json:"maidenName,omitempty"`
}

// Address represents a physical address.
type Address struct {
	AddressLine1 string `json:"addressLine_1"`
	AddressLine2 string `json:"addressLine_2,omitempty"`
	City         string `json:"city"`
	State        string `json:"state"`
	PostalCode   string `json:"postalCode,omitempty"`
	Country      string `json:"country"` // e.g., "NG"
}

// --- Individual KYC Verification ---

// AnchorIndividualKYCRequest is the top-level request for triggering KYC.
type AnchorIndividualKYCRequest struct {
	Data RequestData `json:"data"`
}

// IndividualKYCAttributes defines the attributes for the KYC request.
type IndividualKYCAttributes struct {
	Level  string    `json:"level"` // e.g., "TIER_1"
	Level1 KYCLevel1 `json:"level1"`
}

// KYCLevel1 contains the specific details required for a Tier 1 KYC check.
type KYCLevel1 struct {
	BVN         string `json:"bvn"`
	DateOfBirth string `json:"dateOfBirth"` // Format: "YYYY-MM-DD"
	Gender      string `json:"gender"`      // e.g., "Male", "Female"
}
