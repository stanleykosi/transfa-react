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

	"github.com/transfa/account-service/internal/domain"
	"github.com/transfa/account-service/internal/store"
	"github.com/transfa/account-service/pkg/anchorclient"
)

const (
	maxBeneficiariesFreeTier = 1
)

// AccountService provides methods for managing accounts and beneficiaries.
type AccountService struct {
	accountRepo     store.AccountRepository
	beneficiaryRepo store.BeneficiaryRepository
	bankRepo        store.BankRepository
	anchorClient    *anchorclient.Client
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
	
	// 2. Check user's subscription status and beneficiary count limit.
	subscriptionStatus, err := s.beneficiaryRepo.GetUserSubscriptionStatus(ctx, internalUserID)
	if err != nil {
		return nil, fmt.Errorf("could not verify user subscription status: %w", err)
	}

	if subscriptionStatus != domain.SubscriptionStatusActive {
		count, err := s.beneficiaryRepo.CountBeneficiariesByUserID(ctx, internalUserID)
		if err != nil {
			return nil, fmt.Errorf("could not count existing beneficiaries: %w", err)
		}
		if count >= maxBeneficiariesFreeTier {
			return nil, fmt.Errorf("free tier users can only add %d beneficiary. Please subscribe for unlimited beneficiaries", maxBeneficiariesFreeTier)
		}
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
