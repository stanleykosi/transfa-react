/**
 * @description
 * This package provides a client for communicating with the transaction-service.
 * It encapsulates the logic for making API calls to the transaction service,
 * making it easy for the scheduler to perform financial operations.
 */
package transactionclient

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/transfa/scheduler-service/internal/domain"
)

// Client is a client for the transaction service.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient creates a new transaction service client.
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL:    baseURL,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

// DebitSubscriptionFee calls the transaction-service to debit a subscription fee
// from a user's primary wallet.
func (c *Client) DebitSubscriptionFee(ctx context.Context, userID string, amount int64) error {
	url := fmt.Sprintf("%s/transactions/subscription-fee", c.baseURL)

	payload := domain.TransactionPayload{
		UserID: userID,
		Amount: amount,
		Reason: "Monthly Subscription Fee",
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal transaction payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	// NOTE: This is an internal, server-to-server call.
	// We might add internal auth (e.g., a shared secret) later for security.
	// For now, we trust the internal network.

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute request to transaction service: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		// A 402 Payment Required status specifically means insufficient funds.
		if resp.StatusCode == http.StatusPaymentRequired {
			return errors.New("insufficient funds")
		}
		return fmt.Errorf("transaction service returned error status %d", resp.StatusCode)
	}

	return nil
}
