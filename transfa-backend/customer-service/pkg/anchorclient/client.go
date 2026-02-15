/**
 * @description
 * This package provides a client for interacting with the Anchor BaaS API.
 * It encapsulates the logic for making authenticated HTTP requests, handling
 * request/response bodies, and managing errors from the API.
 *
 * @dependencies
 * - bytes, context, encoding/json, fmt, io, log, net/http, time: Standard Go libraries.
 * - github.com/transfa/customer-service/internal/domain: For the Anchor API request/response structs.
 *
 * @notes
 * - The client is designed to be reusable and can be shared across different microservices
 *   that need to communicate with Anchor.
 * - It includes a default HTTP client with a timeout to prevent requests from hanging indefinitely.
 * - Error handling is designed to provide context, returning a formatted error string
 *   that includes the status code and response body for easier debugging.
 */
package anchorclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/transfa/customer-service/internal/domain"
)

// Client is a client for interacting with the Anchor API.
type Client struct {
	BaseURL    string
	APIKey     string
	httpClient *http.Client
}

// NewClient creates a new Anchor API client.
func NewClient(baseURL, apiKey string) *Client {
	return &Client{
		BaseURL: baseURL,
		APIKey:  apiKey,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// CreateIndividualCustomer sends a request to Anchor to create a new individual customer.
func (c *Client) CreateIndividualCustomer(ctx context.Context, req domain.AnchorCreateIndividualCustomerRequest) (*domain.AnchorIndividualCustomerResponse, error) {
	url := fmt.Sprintf("%s/api/v1/customers", c.BaseURL)
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request body: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create http request: %w", err)
	}

	c.setHeaders(httpReq)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request to Anchor: %w", err)
	}
	defer resp.Body.Close()

	// Handle successful responses (both 200 OK and 201 Created are valid)
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return nil, c.handleErrorResponse(resp)
	}

	var customerResp domain.AnchorIndividualCustomerResponse
	if err := json.NewDecoder(resp.Body).Decode(&customerResp); err != nil {
		return nil, fmt.Errorf("failed to decode successful response: %w", err)
	}

	return &customerResp, nil
}

// TriggerIndividualKYC sends a request to Anchor to trigger the KYC verification process for a customer.
func (c *Client) TriggerIndividualKYC(ctx context.Context, customerID string, req domain.AnchorIndividualKYCRequest) error {
	url := fmt.Sprintf("%s/api/v1/customers/%s/verification/individual", c.BaseURL, customerID)
	body, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("failed to marshal kyc request body: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("failed to create kyc http request: %w", err)
	}

	c.setHeaders(httpReq)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("failed to send kyc request to Anchor: %w", err)
	}
	defer resp.Body.Close()

	// Anchor returns 200 OK on a successful trigger.
	if resp.StatusCode != http.StatusOK {
		return c.handleErrorResponse(resp)
	}

	return nil
}

// UpdateIndividualCustomer updates an existing individual customer profile on Anchor.
// Anchor expects the same payload structure as create customer.
func (c *Client) UpdateIndividualCustomer(ctx context.Context, customerID string, req domain.AnchorCreateIndividualCustomerRequest) error {
	url := fmt.Sprintf("%s/api/v1/customers/update/%s", c.BaseURL, customerID)
	body, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("failed to marshal update request body: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "PUT", url, bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("failed to create update http request: %w", err)
	}

	c.setHeaders(httpReq)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("failed to send update request to Anchor: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return c.handleErrorResponse(resp)
	}

	return nil
}

// setHeaders adds the necessary authentication and content-type headers to the request.
func (c *Client) setHeaders(req *http.Request) {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("x-anchor-key", c.APIKey)
}

// handleErrorResponse reads the body of a failed API call and returns a formatted error.
func (c *Client) handleErrorResponse(resp *http.Response) error {
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("Failed to read error response body: %v", err)
		return fmt.Errorf("anchor API error with status %d, but failed to read response body", resp.StatusCode)
	}
	return fmt.Errorf("anchor API request failed with status %d: %s", resp.StatusCode, string(bodyBytes))
}

// CreateIndividualCustomerWithIdempotency handles customer creation with proper idempotency.
// If the customer already exists, it returns a special error that can be handled by the caller.
func (c *Client) CreateIndividualCustomerWithIdempotency(ctx context.Context, req domain.AnchorCreateIndividualCustomerRequest) (*domain.AnchorIndividualCustomerResponse, error) {
	url := fmt.Sprintf("%s/api/v1/customers", c.BaseURL)
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request body: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create http request: %w", err)
	}

	c.setHeaders(httpReq)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to send request to Anchor: %w", err)
	}
	defer resp.Body.Close()

	// Handle successful responses (both 200 OK and 201 Created are valid)
	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
		var customerResp domain.AnchorIndividualCustomerResponse
		if err := json.NewDecoder(resp.Body).Decode(&customerResp); err != nil {
			return nil, fmt.Errorf("failed to decode successful response: %w", err)
		}
		return &customerResp, nil
	}

	// Handle specific error cases
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("Failed to read error response body: %v", err)
		return nil, fmt.Errorf("anchor API error with status %d, but failed to read response body", resp.StatusCode)
	}

	// Check if this is a "customer already exists" error
	if resp.StatusCode == http.StatusBadRequest && strings.Contains(strings.ToLower(string(bodyBytes)), "already exist") {
		// Try to extract customer ID from the error response
		customerID := extractCustomerIDFromError(string(bodyBytes))
		if customerID != "" {
			return nil, fmt.Errorf("CUSTOMER_ALREADY_EXISTS_WITH_ID: %s|%s", customerID, string(bodyBytes))
		}
		return nil, fmt.Errorf("CUSTOMER_ALREADY_EXISTS: %s", string(bodyBytes))
	}

	return nil, fmt.Errorf("anchor API request failed with status %d: %s", resp.StatusCode, string(bodyBytes))
}

// extractCustomerIDFromError attempts to extract a customer ID from Anchor error responses.
// This is a best-effort approach since Anchor doesn't provide a standard way to get existing customer IDs.
func extractCustomerIDFromError(errorBody string) string {
	// Look for patterns that might contain customer IDs
	// This is a heuristic approach - in practice, you might need to adjust based on actual error responses

	// Look for patterns like "17587033450610-anc_ind_cst" in the error message
	// Anchor customer IDs typically follow this pattern: number-anc_ind_cst
	lines := strings.Split(errorBody, "\n")
	for _, line := range lines {
		// Look for lines that might contain customer ID patterns
		if strings.Contains(line, "-anc_ind_cst") || strings.Contains(line, "-anc_bus_cst") {
			// Try to extract the ID using regex-like string manipulation
			parts := strings.Fields(line)
			for _, part := range parts {
				if strings.Contains(part, "-anc_") && (strings.Contains(part, "_cst") || strings.Contains(part, "_ind") || strings.Contains(part, "_bus")) {
					// Clean up the part to extract just the ID
					cleanID := strings.Trim(part, ".,;:\"'()[]{}")
					if len(cleanID) > 10 && strings.Contains(cleanID, "-anc_") {
						return cleanID
					}
				}
			}
		}
	}

	// If no customer ID found, return empty string
	return ""
}
