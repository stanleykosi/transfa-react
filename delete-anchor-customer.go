/**
 * @description
 * Script to delete Anchor customers by their customer ID.
 * This script allows you to clean up test customers from Anchor
 * so you can reuse email addresses and other details for testing.
 * 
 * Usage:
 *   go run delete-anchor-customer.go <customer-id>
 * 
 * Example:
 *   go run delete-anchor-customer.go 17590519710347-anc_ind_cst
 * 
 * @dependencies
 * - Go 1.19+
 * - Environment variables: ANCHOR_API_KEY, ANCHOR_BASE_URL
 */

package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// AnchorError represents an error response from Anchor API
type AnchorError struct {
	Errors []struct {
		Title  string `json:"title"`
		Status string `json:"status"`
		Detail string `json:"detail"`
	} `json:"errors"`
}

// CustomerInfo represents basic customer information for display
type CustomerInfo struct {
	Data struct {
		ID   string `json:"id"`
		Type string `json:"type"`
		Attributes struct {
			Email string `json:"email"`
			FullName struct {
				FirstName string `json:"firstName"`
				LastName  string `json:"lastName"`
			} `json:"fullName"`
			Status string `json:"status"`
		} `json:"attributes"`
	} `json:"data"`
}

func main() {
	if len(os.Args) != 2 {
		fmt.Println("Usage: go run delete-anchor-customer.go <customer-id>")
		fmt.Println("Example: go run delete-anchor-customer.go 17590519710347-anc_ind_cst")
		os.Exit(1)
	}

	customerID := os.Args[1]
	
	// Load environment variables from .env file if it exists
	loadEnvFile("../.env")
	loadEnvFile(".env")
	
	// Get environment variables
	apiKey := os.Getenv("ANCHOR_API_KEY")
	baseURL := os.Getenv("ANCHOR_API_BASE_URL") // Note: using ANCHOR_API_BASE_URL to match your .env
	
	if apiKey == "" {
		log.Fatal("ANCHOR_API_KEY environment variable is required")
	}
	
	if baseURL == "" {
		baseURL = "https://api.sandbox.getanchor.co" // Default to sandbox
		fmt.Println("Using default sandbox URL:", baseURL)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// First, get customer info to confirm deletion
	fmt.Printf("Fetching customer information for ID: %s\n", customerID)
	customerInfo, err := getCustomerInfo(ctx, baseURL, apiKey, customerID)
	if err != nil {
		log.Fatalf("Failed to fetch customer info: %v", err)
	}

	fmt.Printf("Customer Details:\n")
	fmt.Printf("  ID: %s\n", customerInfo.Data.ID)
	fmt.Printf("  Type: %s\n", customerInfo.Data.Type)
	fmt.Printf("  Name: %s %s\n", customerInfo.Data.Attributes.FullName.FirstName, customerInfo.Data.Attributes.FullName.LastName)
	fmt.Printf("  Email: %s\n", customerInfo.Data.Attributes.Email)
	fmt.Printf("  Status: %s\n", customerInfo.Data.Attributes.Status)

	// Confirm deletion
	fmt.Printf("\nAre you sure you want to delete this customer? (yes/no): ")
	var confirmation string
	fmt.Scanln(&confirmation)
	
	if confirmation != "yes" {
		fmt.Println("Deletion cancelled.")
		os.Exit(0)
	}

	// Delete the customer
	fmt.Printf("Deleting customer %s...\n", customerID)
	err = deleteCustomer(ctx, baseURL, apiKey, customerID)
	if err != nil {
		log.Fatalf("Failed to delete customer: %v", err)
	}

	fmt.Printf("✅ Successfully deleted customer %s\n", customerID)
	fmt.Printf("You can now reuse the email address: %s\n", customerInfo.Data.Attributes.Email)
}

// loadEnvFile loads environment variables from a .env file
func loadEnvFile(filename string) {
	file, err := os.Open(filename)
	if err != nil {
		return // File doesn't exist, that's okay
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			// Remove quotes if present
			value = strings.Trim(value, "\"'")
			os.Setenv(key, value)
		}
	}
}

// getCustomerInfo fetches customer information before deletion
func getCustomerInfo(ctx context.Context, baseURL, apiKey, customerID string) (*CustomerInfo, error) {
	url := fmt.Sprintf("%s/api/v1/customers/%s", baseURL, customerID)
	
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("x-anchor-key", apiKey)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		var anchorErr AnchorError
		if err := json.Unmarshal(body, &anchorErr); err == nil && len(anchorErr.Errors) > 0 {
			return nil, fmt.Errorf("anchor API error: %s - %s", anchorErr.Errors[0].Title, anchorErr.Errors[0].Detail)
		}
		return nil, fmt.Errorf("anchor API error with status %d: %s", resp.StatusCode, string(body))
	}

	var customerInfo CustomerInfo
	if err := json.Unmarshal(body, &customerInfo); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	return &customerInfo, nil
}

// deleteCustomer deletes the customer from Anchor
func deleteCustomer(ctx context.Context, baseURL, apiKey, customerID string) error {
	url := fmt.Sprintf("%s/api/v1/customers/%s", baseURL, customerID)
	
	req, err := http.NewRequestWithContext(ctx, "DELETE", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("x-anchor-key", apiKey)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response: %w", err)
	}

	// Anchor returns 204 No Content on successful deletion
	if resp.StatusCode != http.StatusNoContent {
		var anchorErr AnchorError
		if err := json.Unmarshal(body, &anchorErr); err == nil && len(anchorErr.Errors) > 0 {
			return fmt.Errorf("anchor API error: %s - %s", anchorErr.Errors[0].Title, anchorErr.Errors[0].Detail)
		}
		return fmt.Errorf("anchor API error with status %d: %s", resp.StatusCode, string(body))
	}

	return nil
}
