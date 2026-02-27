/**
 * @description
 * This package provides a client for communicating with the account-service.
 * It encapsulates the logic for making API calls to the account service,
 * specifically for creating money drop accounts.
 */
package accountclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Client is a client for the account service.
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// NewClient creates a new account service client.
func NewClient(baseURL string, apiKey string) *Client {
	return &Client{
		baseURL:    strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// CreateMoneyDropAccountRequest defines the request payload for creating a money drop account.
type CreateMoneyDropAccountRequest struct {
	UserID string `json:"user_id"`
}

// CreateMoneyDropAccountResponse defines the response from creating a money drop account.
type CreateMoneyDropAccountResponse struct {
	AccountID       string `json:"account_id"`
	AnchorAccountID string `json:"anchor_account_id"`
	VirtualNUBAN    string `json:"virtual_nuban"`
	BankName        string `json:"bank_name"`
}

// CreateMoneyDropAccount calls the account-service to create a money drop Anchor account.
func (c *Client) CreateMoneyDropAccount(ctx context.Context, userID string) (*CreateMoneyDropAccountResponse, error) {
	if c.baseURL == "" {
		return nil, fmt.Errorf("account service base url is empty")
	}

	url := fmt.Sprintf("%s/internal/accounts/money-drop", c.baseURL)

	payload := CreateMoneyDropAccountRequest{
		UserID: userID,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if strings.TrimSpace(c.apiKey) != "" {
		req.Header.Set("X-Internal-API-Key", strings.TrimSpace(c.apiKey))
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute request to account service: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("account service returned error status %d", resp.StatusCode)
	}

	var response CreateMoneyDropAccountResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &response, nil
}
