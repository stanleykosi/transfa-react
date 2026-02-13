/**
 * @description
 * This package provides a client for interacting with the Anchor BaaS API.
 * It encapsulates the logic for making authenticated HTTP requests to Anchor's
 * endpoints, handling request body construction, and parsing responses.
 *
 * @dependencies
 * - bytes, context, encoding/json, fmt, net/http, time: Standard Go libraries.
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
	"time"
)

// Client is a client for the Anchor API.
type Client struct {
	BaseURL    string
	APIKey     string
	HTTPClient *http.Client
}

// NewClient creates a new Anchor API client.
func NewClient(baseURL, apiKey string) *Client {
	return &Client{
		BaseURL: baseURL,
		APIKey:  apiKey,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// BookTransferRequest represents the payload for an Anchor Book Transfer.
type BookTransferRequest struct {
	Data struct {
		Type       string `json:"type"`
		Attributes struct {
			Currency string `json:"currency"`
			Amount   int64  `json:"amount"`
			Reason   string `json:"reason"`
		} `json:"attributes"`
		Relationships struct {
			Account struct {
				Data struct {
					Type string `json:"type"`
					ID   string `json:"id"`
				} `json:"data"`
			} `json:"account"`
			DestinationAccount struct {
				Data struct {
					Type string `json:"type"`
					ID   string `json:"id"`
				} `json:"data"`
			} `json:"destinationAccount"`
		} `json:"relationships"`
	} `json:"data"`
}

// NIPTransferRequest represents the payload for an Anchor NIP Transfer.
type NIPTransferRequest struct {
	Data struct {
		Type       string `json:"type"`
		Attributes struct {
			Currency string `json:"currency"`
			Amount   int64  `json:"amount"`
			Reason   string `json:"reason"`
		} `json:"attributes"`
		Relationships struct {
			Account struct {
				Data struct {
					Type string `json:"type"`
					ID   string `json:"id"`
				} `json:"data"`
			} `json:"account"`
			CounterParty struct {
				Data struct {
					Type string `json:"type"`
					ID   string `json:"id"`
				} `json:"data"`
			} `json:"counterParty"`
		} `json:"relationships"`
	} `json:"data"`
}

// TransferResponse is the expected response from Anchor's transfer endpoints.
type TransferResponse struct {
	Data struct {
		ID         string `json:"id"`
		Type       string `json:"type"`
		Attributes struct {
			Status string `json:"status"`
			Fee    int64  `json:"fee"`
		} `json:"attributes"`
	} `json:"data"`
}

// ErrorResponse represents an error from the Anchor API.
type ErrorResponse struct {
	Errors []struct {
		Title  string `json:"title"`
		Detail string `json:"detail"`
		Status string `json:"status"`
	} `json:"errors"`
}

func (e *ErrorResponse) Error() string {
	if len(e.Errors) > 0 {
		return fmt.Sprintf("anchor api error: %s - %s", e.Errors[0].Title, e.Errors[0].Detail)
	}
	return "unknown anchor api error"
}

// BalanceResponse represents the balance response from Anchor API.
type BalanceResponse struct {
	Data struct {
		AvailableBalance int64 `json:"availableBalance"`
		LedgerBalance    int64 `json:"ledgerBalance"`
		Hold             int64 `json:"hold"`
		Pending          int64 `json:"pending"`
	} `json:"data"`
}

// InitiateBookTransfer sends a request to Anchor to perform a book transfer.
func (c *Client) InitiateBookTransfer(ctx context.Context, sourceAccountID, destAccountID, reason string, amount int64) (*TransferResponse, error) {
	reqPayload := BookTransferRequest{}
	reqPayload.Data.Type = "BookTransfer"
	reqPayload.Data.Attributes.Currency = "NGN"
	reqPayload.Data.Attributes.Amount = amount
	reqPayload.Data.Attributes.Reason = reason
	reqPayload.Data.Relationships.Account.Data.Type = "DepositAccount"
	reqPayload.Data.Relationships.Account.Data.ID = sourceAccountID
	reqPayload.Data.Relationships.DestinationAccount.Data.Type = "DepositAccount"
	reqPayload.Data.Relationships.DestinationAccount.Data.ID = destAccountID

	return c.doTransfer(ctx, reqPayload)
}

// InitiateNIPTransfer sends a request to Anchor to perform an external NIP transfer.
func (c *Client) InitiateNIPTransfer(ctx context.Context, sourceAccountID, counterPartyID, reason string, amount int64) (*TransferResponse, error) {
	reqPayload := NIPTransferRequest{}
	reqPayload.Data.Type = "NIPTransfer"
	reqPayload.Data.Attributes.Currency = "NGN"
	reqPayload.Data.Attributes.Amount = amount
	reqPayload.Data.Attributes.Reason = reason
	reqPayload.Data.Relationships.Account.Data.Type = "DepositAccount"
	reqPayload.Data.Relationships.Account.Data.ID = sourceAccountID
	reqPayload.Data.Relationships.CounterParty.Data.Type = "CounterParty"
	reqPayload.Data.Relationships.CounterParty.Data.ID = counterPartyID

	return c.doTransfer(ctx, reqPayload)
}

// doTransfer is a generic helper function to execute transfer requests.
func (c *Client) doTransfer(ctx context.Context, payload interface{}) (*TransferResponse, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal transfer request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.BaseURL+"/api/v1/transfers", bytes.NewBuffer(body))
	if err != nil {
		return nil, fmt.Errorf("failed to create transfer request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("x-anchor-key", c.APIKey)

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute transfer request: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read transfer response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errResp ErrorResponse
		if err := json.Unmarshal(bodyBytes, &errResp); err != nil {
			log.Printf("level=warn component=anchor_client op=transfer status=%d msg=\"non-2xx response (unparsable error body)\"", resp.StatusCode)
			return nil, fmt.Errorf("failed to decode error response (status %d)", resp.StatusCode)
		}
		log.Printf("level=warn component=anchor_client op=transfer status=%d title=%q detail=%q", resp.StatusCode, firstErrorTitle(errResp), firstErrorDetail(errResp))
		return nil, &errResp
	}

	var successResp TransferResponse
	if err := json.Unmarshal(bodyBytes, &successResp); err != nil {
		return nil, fmt.Errorf("failed to decode success response: %w", err)
	}

	return &successResp, nil
}

// GetAccountBalance fetches the balance for a specific account from Anchor API.
func (c *Client) GetAccountBalance(ctx context.Context, accountID string) (*BalanceResponse, error) {
	url := c.BaseURL + "/api/v1/accounts/balance/" + accountID

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create balance request: %w", err)
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("x-anchor-key", c.APIKey)

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute balance request: %w", err)
	}
	defer resp.Body.Close()
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read balance response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errResp ErrorResponse
		if err := json.Unmarshal(bodyBytes, &errResp); err != nil {
			log.Printf("level=warn component=anchor_client op=get_balance account_id=%s status=%d msg=\"non-2xx response (unparsable error body)\"", accountID, resp.StatusCode)
			return nil, fmt.Errorf("failed to decode error response (status %d)", resp.StatusCode)
		}
		log.Printf("level=warn component=anchor_client op=get_balance account_id=%s status=%d title=%q detail=%q", accountID, resp.StatusCode, firstErrorTitle(errResp), firstErrorDetail(errResp))
		return nil, &errResp
	}

	var balanceResp BalanceResponse
	if err := json.Unmarshal(bodyBytes, &balanceResp); err != nil {
		return nil, fmt.Errorf("failed to decode balance response: %w", err)
	}

	return &balanceResp, nil
}

func firstErrorTitle(resp ErrorResponse) string {
	if len(resp.Errors) == 0 {
		return ""
	}
	return resp.Errors[0].Title
}

func firstErrorDetail(resp ErrorResponse) string {
	if len(resp.Errors) == 0 {
		return ""
	}
	return resp.Errors[0].Detail
}
