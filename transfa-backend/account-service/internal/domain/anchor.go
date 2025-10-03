/**
 * @description
 * This file defines the Go structs that map to the JSON:API specification
 * for account-related endpoints of the Anchor BaaS platform.
 *
 * @notes
 * - These structs are used by the Anchor API client to serialize requests
 *   and deserialize responses for creating accounts and fetching details.
 */
package domain

// --- Generic JSON:API Structures ---

// RequestData is a generic container for a JSON:API request payload.
type RequestData struct {
	Type          string                 `json:"type"`
	Attributes    interface{}            `json:"attributes"`
	Relationships map[string]interface{} `json:"relationships,omitempty"`
}

// ResponseData is a generic container for a JSON:API response payload.
type ResponseData struct {
	ID            string                 `json:"id"`
	Type          string                 `json:"type"`
	Attributes    interface{}            `json:"attributes"`
	Relationships map[string]interface{} `json:"relationships,omitempty"`
}

// --- Create Deposit Account ---

// CreateDepositAccountRequest is the top-level request structure.
type CreateDepositAccountRequest struct {
	Data RequestData `json:"data"`
}

// DepositAccountAttributes defines the attributes for creating a new deposit account.
type DepositAccountAttributes struct {
	ProductName string `json:"productName"` // "SAVINGS" or "CURRENT"
}

// CustomerRelationshipData defines the structure for linking a resource to a customer.
type CustomerRelationshipData struct {
	Data struct {
		ID   string `json:"id"`
		Type string `json:"type"` // "IndividualCustomer" or "BusinessCustomer"
	} `json:"data"`
}

// CreateDepositAccountResponse is the top-level response structure.
type CreateDepositAccountResponse struct {
	Data ResponseData `json:"data"`
}

// --- Get Account Numbers (Virtual NUBAN) ---

// GetDepositAccountResponse captures the deposit account resource and any included
// related resources (such as AccountNumber records) returned by Anchor.
type GetDepositAccountResponse struct {
	Data struct {
		ID         string                 `json:"id"`
		Type       string                 `json:"type"`
		Attributes map[string]interface{} `json:"attributes"`
	} `json:"data"`
	Included []struct {
		ID         string `json:"id"`
		Type       string `json:"type"`
		Attributes struct {
			AccountNumber string `json:"accountNumber"`
		} `json:"attributes"`
	} `json:"included"`
}

// VirtualNUBANInfo contains both the Virtual NUBAN and associated bank name.
type VirtualNUBANInfo struct {
	AccountNumber string `json:"accountNumber"`
	BankName      string `json:"bankName"`
}
