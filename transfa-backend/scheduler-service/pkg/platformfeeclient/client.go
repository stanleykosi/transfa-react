/**
 * @description
 * Client for communicating with the platform-fee service.
 */
package platformfeeclient

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Client provides methods to interact with the platform-fee service.
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// NewClient creates a new platform-fee service client.
func NewClient(baseURL, apiKey string) *Client {
	normalizedURL := strings.TrimSuffix(baseURL, "/")
	return &Client{
		baseURL:    normalizedURL,
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 20 * time.Second},
	}
}

// GenerateInvoices triggers invoice generation.
func (c *Client) GenerateInvoices(ctx context.Context) error {
	return c.post(ctx, "/internal/platform-fees/invoices/generate")
}

// RunChargeAttempts triggers charge attempts.
func (c *Client) RunChargeAttempts(ctx context.Context) error {
	return c.post(ctx, "/internal/platform-fees/attempts/run")
}

// MarkDelinquent triggers delinquency updates.
func (c *Client) MarkDelinquent(ctx context.Context) error {
	return c.post(ctx, "/internal/platform-fees/delinquency/run")
}

func (c *Client) post(ctx context.Context, path string) error {
	if c.baseURL == "" {
		return fmt.Errorf("platform fee service base URL is not configured")
	}

	url := fmt.Sprintf("%s%s", c.baseURL, path)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewBuffer([]byte("{}")))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	if c.apiKey != "" {
		req.Header.Set("X-Internal-API-Key", c.apiKey)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("platform fee service returned status %d", resp.StatusCode)
	}

	return nil
}
