/**
 * @description
 * This file contains the core business logic for the account-service, implemented
 * as an `AccountService`. It orchestrates operations by coordinating the
 * database repository and external API clients (like Anchor).
 *
 * @notes
 * - This service layer keeps the API handlers (controllers) thin and focused
 *   on HTTP concerns, while the business logic remains independent.
 */
package app

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/transfa/account-service/internal/domain"
	"github.com/transfa/account-service/internal/store"
	"github.com/transfa/account-service/pkg/anchorclient"
)

// AccountService provides methods for managing accounts and beneficiaries.
type AccountService struct {
	accountRepo     store.AccountRepository
	beneficiaryRepo store.BeneficiaryRepository
	bankRepo        store.BankRepository
	anchorClient    *anchorclient.Client
	cacheWarmingMutex sync.Mutex // Prevents multiple cache warming operations
}

// NewAccountService creates a new instance of AccountService.
func NewAccountService(accountRepo store.AccountRepository, beneficiaryRepo store.BeneficiaryRepository, bankRepo store.BankRepository, anchorClient *anchorclient.Client) *AccountService {
	return &AccountService{
		accountRepo:     accountRepo,
		beneficiaryRepo: beneficiaryRepo,
		bankRepo:        bankRepo,
		anchorClient:    anchorClient,
	}
}

// CreateBeneficiaryInput defines the required input for creating a beneficiary.
type CreateBeneficiaryInput struct {
	UserID        string
	AccountNumber string
	BankCode      string
}

// CreateBeneficiary orchestrates the process of adding a new beneficiary.
func (s *AccountService) CreateBeneficiary(ctx context.Context, input CreateBeneficiaryInput) (*domain.Beneficiary, error) {
	// 1. Resolve Clerk User ID to internal UUID
	internalUserID, err := s.accountRepo.FindUserIDByClerkUserID(ctx, input.UserID)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}
	
	// 2. Verify account details with Anchor.
	verifyResp, err := s.anchorClient.VerifyBankAccount(ctx, input.BankCode, input.AccountNumber)
	if err != nil {
		return nil, fmt.Errorf("failed to verify bank account with provider: %w", err)
	}
	accountName := verifyResp.Data.Attributes.AccountName
	
	// Debug: Log the account verification response
	fmt.Printf("DEBUG: Account verification response: %+v\n", verifyResp)
	fmt.Printf("DEBUG: Extracted account name: '%s'\n", accountName)
	
	// Handle cases where account name is empty or generic
	if accountName == "" || accountName == "N/A" || accountName == "Unknown" {
		// Use a more user-friendly fallback
		accountName = fmt.Sprintf("Account ending in %s", input.AccountNumber[len(input.AccountNumber)-4:])
		fmt.Printf("DEBUG: Using fallback account name: '%s'\n", accountName)
	}

	// 3. Create CounterParty on Anchor.
	counterpartyReq := domain.CreateCounterPartyRequest{}
	counterpartyReq.Data.Type = "CounterParty"
	counterpartyReq.Data.Attributes.BankCode = input.BankCode
	counterpartyReq.Data.Attributes.AccountNumber = input.AccountNumber
	counterpartyReq.Data.Attributes.AccountName = accountName
	counterpartyReq.Data.Attributes.VerifyName = false // Already verified

	counterpartyResp, err := s.anchorClient.CreateCounterParty(ctx, counterpartyReq)
	if err != nil {
		return nil, fmt.Errorf("failed to create counterparty with provider: %w", err)
	}

	// 4. Get bank name from cached banks (more efficient than calling API)
	bankName := s.getBankNameFromCode(ctx, input.BankCode)

	// 5. Save the new beneficiary to our database.
	beneficiary := &domain.Beneficiary{
		UserID:               internalUserID,
		AnchorCounterpartyID: counterpartyResp.Data.ID,
		AccountName:          accountName,
		AccountNumberMasked:  maskAccountNumber(input.AccountNumber),
		BankName:             bankName,
	}

	return s.beneficiaryRepo.CreateBeneficiary(ctx, beneficiary)
}

// ListBeneficiaries retrieves all beneficiaries for a user.
// The userID parameter is the Clerk User ID, which needs to be resolved to internal UUID.
func (s *AccountService) ListBeneficiaries(ctx context.Context, clerkUserID string) ([]domain.Beneficiary, error) {
	// Resolve Clerk User ID to internal UUID
	internalUserID, err := s.accountRepo.FindUserIDByClerkUserID(ctx, clerkUserID)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}
	
	return s.beneficiaryRepo.GetBeneficiariesByUserID(ctx, internalUserID)
}

// DeleteBeneficiary removes a beneficiary for a user.
func (s *AccountService) DeleteBeneficiary(ctx context.Context, clerkUserID, beneficiaryID string) error {
	// Resolve Clerk User ID to internal UUID
	internalUserID, err := s.accountRepo.FindUserIDByClerkUserID(ctx, clerkUserID)
	if err != nil {
		return fmt.Errorf("user not found: %w", err)
	}
	
	// Note: The repository layer handles the ownership check in the DELETE query.
	return s.beneficiaryRepo.DeleteBeneficiary(ctx, beneficiaryID, internalUserID)
}

// ListBanks retrieves the list of supported banks from Anchor with caching.
func (s *AccountService) ListBanks(ctx context.Context) (*domain.ListBanksResponse, error) {
	// Try to get from cache first
	cachedBanks, err := s.bankRepo.GetCachedBanks(ctx)
	if err == nil && len(cachedBanks) > 0 {
		// Check if cache is expiring soon and warm it in background
		go s.checkAndWarmCache()
		return &domain.ListBanksResponse{Data: cachedBanks}, nil
	}

	// If cache miss or error, fetch from Anchor API
	banksResp, err := s.anchorClient.ListBanks(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch banks from Anchor: %w", err)
	}

	// Cache the banks for future requests (non-blocking)
	go func() {
		cacheCtx := context.Background()
		if cacheErr := s.bankRepo.CacheBanks(cacheCtx, banksResp.Data); cacheErr != nil {
			// Log error but don't fail the request
			fmt.Printf("Warning: failed to cache banks: %v\n", cacheErr)
		}
	}()

	return banksResp, nil
}

// checkAndWarmCache checks if cache is expiring soon and warms it if needed
func (s *AccountService) checkAndWarmCache() {
	ctx := context.Background()
	
	// Check if cache expires within 1 hour
	expiringSoon, err := s.bankRepo.IsCacheExpiringSoon(ctx, time.Hour)
	if err != nil {
		// If we can't check, don't warm (cache might not exist)
		return
	}
	
	if expiringSoon {
		log.Printf("Cache is expiring soon, warming cache in background...")
		s.warmCacheInBackground()
	}
}

// warmCacheInBackground refreshes the cache before it expires
func (s *AccountService) warmCacheInBackground() {
	// Prevent multiple cache warming operations
	if !s.cacheWarmingMutex.TryLock() {
		log.Printf("Cache warming already in progress, skipping...")
		return
	}
	defer s.cacheWarmingMutex.Unlock()
	
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	
	// Fetch fresh data from Anchor API
	banksResp, err := s.anchorClient.ListBanks(ctx)
	if err != nil {
		log.Printf("Warning: failed to warm cache - could not fetch from Anchor: %v", err)
		return
	}
	
	// Validate we got data
	if len(banksResp.Data) == 0 {
		log.Printf("Warning: failed to warm cache - received empty bank list from Anchor")
		return
	}
	
	// Cache the fresh data
	if err := s.bankRepo.CacheBanks(ctx, banksResp.Data); err != nil {
		log.Printf("Warning: failed to warm cache - could not store in database: %v", err)
		return
	}
	
	log.Printf("Successfully warmed cache with %d banks", len(banksResp.Data))
}

// getBankNameFromCode retrieves the bank name from the cached bank list using the bank code.
func (s *AccountService) getBankNameFromCode(ctx context.Context, bankCode string) string {
	// Try to get from cache first
	cachedBanks, err := s.bankRepo.GetCachedBanks(ctx)
	if err != nil {
		// If cache miss, try to fetch fresh data
		banksResp, fetchErr := s.anchorClient.ListBanks(ctx)
		if fetchErr != nil {
			fmt.Printf("Warning: could not fetch bank list: %v\n", fetchErr)
			return "Unknown Bank"
		}
		
		// Cache the fresh data for future use
		go func() {
			cacheCtx := context.Background()
			if cacheErr := s.bankRepo.CacheBanks(cacheCtx, banksResp.Data); cacheErr != nil {
				fmt.Printf("Warning: failed to cache banks: %v\n", cacheErr)
			}
		}()
		
		cachedBanks = banksResp.Data
	}
	
	// Search for the bank by code
	for _, bank := range cachedBanks {
		if bank.Attributes.NipCode == bankCode {
			return bank.Attributes.Name
		}
	}
	
	return "Unknown Bank"
}

// maskAccountNumber masks an account number, showing only the first and last two digits.
func maskAccountNumber(accountNumber string) string {
	if len(accountNumber) > 4 {
		return fmt.Sprintf("%s...%s", accountNumber[:2], accountNumber[len(accountNumber)-2:])
	}
	return "****"
}

// CreateMoneyDropAccountResponse defines the response from creating a money drop account.
type CreateMoneyDropAccountResponse struct {
	AccountID       string `json:"account_id"`
	AnchorAccountID string `json:"anchor_account_id"`
	VirtualNUBAN    string `json:"virtual_nuban"`
	BankName        string `json:"bank_name"`
}

// CreateMoneyDropAccount creates a new Anchor deposit account for money drops.
// This method creates a separate Anchor account that will be used exclusively for money drop operations.
func (s *AccountService) CreateMoneyDropAccount(ctx context.Context, userID string) (*CreateMoneyDropAccountResponse, error) {
	// 1. Check if user already has a money drop account
	existingAccount, err := s.accountRepo.FindMoneyDropAccountByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to check for existing money drop account: %w", err)
	}
	if existingAccount != nil && existingAccount.AnchorAccountID != "" {
		// User already has a money drop account with Anchor account
		return &CreateMoneyDropAccountResponse{
			AccountID:       existingAccount.ID,
			AnchorAccountID: existingAccount.AnchorAccountID,
			VirtualNUBAN:    existingAccount.VirtualNUBAN,
			BankName:        existingAccount.BankName,
		}, nil
	}

	// 2. Get user's Anchor customer ID
	anchorCustomerID, err := s.accountRepo.FindAnchorCustomerIDByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get anchor customer ID: %w", err)
	}

	// 3. Create Anchor deposit account for money drops
	accountReq := domain.CreateDepositAccountRequest{
		Data: domain.RequestData{
			Type: "DepositAccount",
			Attributes: domain.DepositAccountAttributes{
				ProductName: "SAVINGS",
			},
			Relationships: map[string]interface{}{
				"customer": domain.CustomerRelationshipData{
					Data: struct {
						ID   string `json:"id"`
						Type string `json:"type"`
					}{
						ID:   anchorCustomerID,
						Type: "IndividualCustomer",
					},
				},
			},
		},
	}

	anchorAccount, err := s.anchorClient.CreateDepositAccount(ctx, accountReq)
	if err != nil {
		return nil, fmt.Errorf("failed to create Anchor deposit account: %w", err)
	}
	log.Printf("Successfully created Anchor DepositAccount %s for money drops", anchorAccount.Data.ID)

	// 4. Get Virtual NUBAN for the account
	nubanInfo, err := s.anchorClient.GetVirtualNUBANForAccount(ctx, anchorAccount.Data.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch VirtualNUBAN: %w", err)
	}
	log.Printf("Successfully fetched VirtualNUBAN: %s, Bank: %s", nubanInfo.AccountNumber, nubanInfo.BankName)

	// 5. Get bank name
	bankName := nubanInfo.BankName
	if bankName == "" {
		if attributesMap, ok := anchorAccount.Data.Attributes.(map[string]interface{}); ok {
			if bankData, exists := attributesMap["bank"]; exists {
				if bankMap, ok := bankData.(map[string]interface{}); ok {
					if name, exists := bankMap["name"]; exists {
						if nameStr, ok := name.(string); ok {
							bankName = nameStr
						}
					}
				}
			}
		}
		if bankName == "" {
			bankName = "Unknown Bank"
		}
	}

	// 6. Create or update account record in database
	var accountID string
	if existingAccount != nil {
		// Update existing account with Anchor details
		accountID = existingAccount.ID
		if err := s.accountRepo.UpdateAccount(ctx, accountID, anchorAccount.Data.ID, nubanInfo.AccountNumber, bankName); err != nil {
			return nil, fmt.Errorf("failed to update account with Anchor details: %w", err)
		}
	} else {
		// Create new account record
		newAccount := &domain.Account{
			UserID:          userID,
			AnchorAccountID: anchorAccount.Data.ID,
			VirtualNUBAN:    nubanInfo.AccountNumber,
			BankName:        bankName,
			Type:            domain.MoneyDropAccount,
		}
		accountID, err = s.accountRepo.CreateAccount(ctx, newAccount)
		if err != nil {
			return nil, fmt.Errorf("failed to save account to database: %w", err)
		}
	}

	log.Printf("Successfully created money drop account for user %s", userID)

	return &CreateMoneyDropAccountResponse{
		AccountID:       accountID,
		AnchorAccountID: anchorAccount.Data.ID,
		VirtualNUBAN:    nubanInfo.AccountNumber,
		BankName:        bankName,
	}, nil
}
