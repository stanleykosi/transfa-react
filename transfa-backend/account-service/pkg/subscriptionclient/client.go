/**
 * @description
 * This file provides a client for communicating with the subscription-service
 * to retrieve user subscription status and validate beneficiary limits.
 */
package subscriptionclient

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
)

// SubscriptionStatus represents the subscription status returned by the subscription service
type SubscriptionStatus struct {
	Status             string      `json:"status"`
	IsActive           bool        `json:"is_active"`
	AutoRenew          bool        `json:"auto_renew"`
	TransfersRemaining int         `json:"transfers_remaining"`
	CurrentPeriodEnd   interface{} `json:"current_period_end,omitempty"`
}

// Client provides methods to interact with the subscription service
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient creates a new subscription service client
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 0, // Use default timeout
		},
	}
}

// GetUserSubscriptionStatus retrieves the subscription status for a given user from the subscription service
// This requires the Clerk JWT token from the request context
func (c *Client) GetUserSubscriptionStatus(ctx context.Context, authToken string) (*SubscriptionStatus, error) {
	if authToken == "" {
		return nil, fmt.Errorf("authorization token is required")
	}

	url := fmt.Sprintf("%s/status", c.baseURL)
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		log.Printf("Error creating request to subscription service: %v", err)
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Add the authorization header with the JWT token
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", authToken))
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		log.Printf("Error calling subscription service: %v", err)
		return nil, fmt.Errorf("failed to call subscription service: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("Error reading response from subscription service: %v", err)
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	// Check status code
	if resp.StatusCode != http.StatusOK {
		log.Printf("Subscription service returned status %d: %s", resp.StatusCode, string(body))
		return nil, fmt.Errorf("subscription service returned status %d", resp.StatusCode)
	}

	// Parse the response
	var status SubscriptionStatus
	if err := json.Unmarshal(body, &status); err != nil {
		log.Printf("Error parsing subscription service response: %v", err)
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &status, nil
}
