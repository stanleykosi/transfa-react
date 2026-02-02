/**
 * @description
 * Client for communicating with the transaction-service.
 */
package transactionclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
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
	normalizedURL := strings.TrimSuffix(baseURL, "/")
	return &Client{
		baseURL:    normalizedURL,
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}
}

// RefundMoneyDrop calls the transaction-service to refund a money drop.
func (c *Client) RefundMoneyDrop(ctx context.Context, dropID, creatorID string, amount int64) error {
	if c.baseURL == "" {
		return fmt.Errorf("transaction service base URL is not configured")
	}

	var url string
	if strings.HasSuffix(c.baseURL, "/transactions") {
		url = fmt.Sprintf("%s/internal/money-drops/refund", c.baseURL)
	} else {
		url = fmt.Sprintf("%s/transactions/internal/money-drops/refund", c.baseURL)
	}

	payload := domain.RefundPayload{
		DropID:    dropID,
		CreatorID: creatorID,
		Amount:    amount,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal refund payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute request to transaction service: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("transaction service returned error status %d", resp.StatusCode)
	}

	return nil
}
