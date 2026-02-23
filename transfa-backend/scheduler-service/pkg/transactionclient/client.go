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

// RefundMoneyDrop calls the transaction-service to refund a money drop.
func (c *Client) RefundMoneyDrop(ctx context.Context, dropID, creatorID string, amount int64) error {
	if c.baseURL == "" {
		return fmt.Errorf("transaction service base URL is not configured")
	}
	if c.apiKey == "" {
		return fmt.Errorf("transaction service internal api key is not configured")
	}

	url := c.internalMoneyDropURL("/refund")

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
	req.Header.Set("X-Internal-API-Key", c.apiKey)

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

// ReconcileMoneyDropClaims triggers internal reconciliation for stale pending money-drop claims.
func (c *Client) ReconcileMoneyDropClaims(ctx context.Context, limit int) error {
	if c.baseURL == "" {
		return fmt.Errorf("transaction service base URL is not configured")
	}
	if c.apiKey == "" {
		return fmt.Errorf("transaction service internal api key is not configured")
	}
	if limit <= 0 {
		limit = 100
	}

	url := c.internalMoneyDropURL("/reconcile-claims")
	payload := map[string]int{"limit": limit}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal claim reconciliation payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer(body))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-API-Key", c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute reconciliation request to transaction service: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("transaction service returned error status %d", resp.StatusCode)
	}

	return nil
}

func (c *Client) internalMoneyDropURL(pathSuffix string) string {
	if strings.HasSuffix(c.baseURL, "/transactions") {
		return fmt.Sprintf("%s/internal/money-drops%s", c.baseURL, pathSuffix)
	}
	return fmt.Sprintf("%s/transactions/internal/money-drops%s", c.baseURL, pathSuffix)
}
