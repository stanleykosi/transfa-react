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
	beneficiaryRepo store.BeneficiaryRepository
	anchorClient    *anchorclient.Client
}

// NewAccountService creates a new instance of AccountService.
func NewAccountService(beneficiaryRepo store.BeneficiaryRepository, anchorClient *anchorclient.Client) *AccountService {
	return &AccountService{
		beneficiaryRepo: beneficiaryRepo,
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
	// 1. Check user's subscription status and beneficiary count limit.
	subscriptionStatus, err := s.beneficiaryRepo.GetUserSubscriptionStatus(ctx, input.UserID)
	if err != nil {
		return nil, fmt.Errorf("could not verify user subscription status: %w", err)
	}

	if subscriptionStatus != domain.SubscriptionStatusActive {
		count, err := s.beneficiaryRepo.CountBeneficiariesByUserID(ctx, input.UserID)
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

	// 4. Get the list of banks to find the bank name from the bank code.
	banksResp, err := s.anchorClient.ListBanks(ctx)
	if err != nil {
		// Non-fatal, we can proceed without the bank name if needed.
		fmt.Printf("Warning: could not fetch bank list: %v\n", err)
	}
	
	bankName := "Unknown Bank"
	if banksResp != nil {
		for _, bank := range banksResp.Data {
			if bank.Attributes.NipCode == input.BankCode {
				bankName = bank.Attributes.Name
				break
			}
		}
	}

	// 5. Save the new beneficiary to our database.
	beneficiary := &domain.Beneficiary{
		UserID:               input.UserID,
		AnchorCounterpartyID: counterpartyResp.Data.ID,
		AccountName:          accountName,
		AccountNumberMasked:  maskAccountNumber(input.AccountNumber),
		BankName:             bankName,
	}

	return s.beneficiaryRepo.CreateBeneficiary(ctx, beneficiary)
}

// ListBeneficiaries retrieves all beneficiaries for a user.
func (s *AccountService) ListBeneficiaries(ctx context.Context, userID string) ([]domain.Beneficiary, error) {
	return s.beneficiaryRepo.GetBeneficiariesByUserID(ctx, userID)
}

// DeleteBeneficiary removes a beneficiary for a user.
func (s *AccountService) DeleteBeneficiary(ctx context.Context, userID, beneficiaryID string) error {
	// Note: The repository layer handles the ownership check in the DELETE query.
	return s.beneficiaryRepo.DeleteBeneficiary(ctx, beneficiaryID, userID)
}

// maskAccountNumber masks an account number, showing only the first and last two digits.
func maskAccountNumber(accountNumber string) string {
	if len(accountNumber) > 4 {
		return fmt.Sprintf("%s...%s", accountNumber[:2], accountNumber[len(accountNumber)-2:])
	}
	return "****"
}
