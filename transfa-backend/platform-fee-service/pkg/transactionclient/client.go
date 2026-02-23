/**
 * @description
 * Client for communicating with the transaction-service for platform fee debits.
 */
package transactionclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

var ErrInsufficientFunds = errors.New("insufficient funds")

// Client is a client for the transaction service.
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// NewClient creates a new transaction service client.
func NewClient(baseURL string, apiKey string) *Client {
	normalizedURL := strings.TrimSuffix(baseURL, "/")
	return &Client{
		baseURL:    normalizedURL,
		apiKey:     strings.TrimSpace(apiKey),
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

// DebitPlatformFee calls the transaction-service to debit a platform fee.
func (c *Client) DebitPlatformFee(ctx context.Context, userID string, amount int64, invoiceID string) (string, error) {
	if userID == "" {
		return "", fmt.Errorf("user ID is required")
	}
	if c.apiKey == "" {
		return "", fmt.Errorf("transaction service internal api key is not configured")
	}

	url := c.buildURL("/transactions/platform-fee")

	payload := map[string]interface{}{
		"user_id":    userID,
		"amount":     amount,
		"reason":     "Monthly Platform Fee",
		"invoice_id": invoiceID,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(body))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-API-Key", c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusPaymentRequired {
		return "", ErrInsufficientFunds
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("transaction service returned status %d", resp.StatusCode)
	}

	var response struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return "", fmt.Errorf("failed to parse transaction response: %w", err)
	}

	return response.ID, nil
}

func (c *Client) buildURL(path string) string {
	if c.baseURL == "" {
		return path
	}
	if strings.HasSuffix(c.baseURL, "/transactions") {
		return fmt.Sprintf("%s%s", c.baseURL, strings.TrimPrefix(path, "/transactions"))
	}
	return fmt.Sprintf("%s%s", c.baseURL, path)
}
