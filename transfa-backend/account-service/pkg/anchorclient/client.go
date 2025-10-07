/**
 * @description
 * This package provides a client for interacting with the Anchor BaaS API.
 * It encapsulates the logic for making authenticated HTTP requests to Anchor's
 * various endpoints.
 *
 * Key features:
 * - Manages the API base URL and secret key.
 * - Provides methods for specific Anchor operations (e.g., creating accounts).
 * - Handles JSON serialization/deserialization and error handling for API calls.
 *
 * @dependencies
 * - bytes, context, encoding/json, fmt, io, net/http, time: Standard Go libraries.
 * - The service's internal domain package for Anchor API request/response models.
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

	"github.com/transfa/account-service/internal/domain"
)

// Client is a client for the Anchor API.
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// NewClient creates a new Anchor API client.
func NewClient(baseURL, apiKey string) *Client {
	return &Client{
		baseURL: baseURL,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// CreateDepositAccount creates a new deposit account on Anchor.
func (c *Client) CreateDepositAccount(ctx context.Context, req domain.CreateDepositAccountRequest) (*domain.CreateDepositAccountResponse, error) {
	url := fmt.Sprintf("%s/api/v1/accounts", c.baseURL)
	var resp domain.CreateDepositAccountResponse

	err := c.do(ctx, http.MethodPost, url, req, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

// GetVirtualNUBANForAccount fetches the virtual account number (NUBAN) and bank name for a given deposit account ID.
func (c *Client) GetVirtualNUBANForAccount(ctx context.Context, depositAccountID string) (*domain.VirtualNUBANInfo, error) {
	url := fmt.Sprintf("%s/api/v1/accounts/%s?include=AccountNumber", c.baseURL, depositAccountID)
	var resp domain.GetDepositAccountResponse

	err := c.do(ctx, http.MethodGet, url, nil, &resp)
	if err != nil {
		return nil, err
	}

	// Extract bank name from main account data
	var bankName string
	if bankData, exists := resp.Data.Attributes["bank"]; exists {
		if bankMap, ok := bankData.(map[string]interface{}); ok {
			if name, exists := bankMap["name"]; exists {
				if nameStr, ok := name.(string); ok {
					bankName = nameStr
				}
			}
		}
	}

	// Extract Virtual NUBAN from included section
	for _, included := range resp.Included {
		if strings.EqualFold(included.Type, "AccountNumber") && included.Attributes.AccountNumber != "" {
			return &domain.VirtualNUBANInfo{
				AccountNumber: included.Attributes.AccountNumber,
				BankName:      bankName,
			}, nil
		}
	}

	return nil, fmt.Errorf("no virtual account number found for deposit account %s", depositAccountID)
}

// VerifyBankAccount verifies the details of an external bank account.
func (c *Client) VerifyBankAccount(ctx context.Context, bankCode, accountNumber string) (*domain.VerifyAccountResponse, error) {
	var resp domain.VerifyAccountResponse
	url := fmt.Sprintf("%s/api/v1/payments/verify-account/%s/%s", c.baseURL, bankCode, accountNumber)
	err := c.do(ctx, http.MethodGet, url, nil, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

// CreateCounterParty creates a new counterparty (beneficiary) on Anchor.
func (c *Client) CreateCounterParty(ctx context.Context, req domain.CreateCounterPartyRequest) (*domain.CreateCounterPartyResponse, error) {
	var resp domain.CreateCounterPartyResponse
	url := fmt.Sprintf("%s/api/v1/counterparties", c.baseURL)
	err := c.do(ctx, http.MethodPost, url, req, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}

// DeleteCounterParty deletes a counterparty from Anchor.
func (c *Client) DeleteCounterParty(ctx context.Context, counterpartyID string) error {
	url := fmt.Sprintf("%s/api/v1/counterparties/%s", c.baseURL, counterpartyID)
	return c.do(ctx, http.MethodDelete, url, nil, nil)
}

// ListBanks fetches the list of supported banks from Anchor.
func (c *Client) ListBanks(ctx context.Context) (*domain.ListBanksResponse, error) {
	var resp domain.ListBanksResponse
	url := fmt.Sprintf("%s/api/v1/banks", c.baseURL)
	err := c.do(ctx, http.MethodGet, url, nil, &resp)
	if err != nil {
		return nil, err
	}
	return &resp, nil
}


// do is a helper function to make HTTP requests to the Anchor API.
func (c *Client) do(ctx context.Context, method, url string, body, target interface{}) error {
	var reqBody io.Reader
	if body != nil {
		jsonBody, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("failed to marshal request body: %w", err)
		}
		reqBody = bytes.NewBuffer(jsonBody)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, reqBody)
	if err != nil {
		return fmt.Errorf("failed to create http request: %w", err)
	}

	// Set required headers
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("x-anchor-key", c.apiKey)

	log.Printf("Making Anchor API request: %s %s", method, url)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Printf("Anchor API returned non-success status code %d: %s", resp.StatusCode, string(respBody))
		return fmt.Errorf("anchor API error: status %d, body: %s", resp.StatusCode, string(respBody))
	}

	if target != nil {
		if err := json.Unmarshal(respBody, target); err != nil {
			return fmt.Errorf("failed to unmarshal response body: %w", err)
		}
	}

	return nil
}
