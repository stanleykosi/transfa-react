/**
 * @description
 * This file contains the core business logic for the transaction-service. The `Service`
 * struct orchestrates all money movement operations, coordinating between the database
 * repository, the Anchor BaaS API client, and the message broker.
 *
 * Key features:
 * - Implements the main use cases: P2P transfers and self-transfers.
 * - Contains the critical subscription-based routing logic for P2P payments.
 * - Ensures transactional integrity by creating and updating records in the `transactions` table.
 * - Publishes events to RabbitMQ for asynchronous processing by other services.
 *
 * @dependencies
 * - context, errors, fmt, log, time: Standard Go libraries.
 * - github.com/google/uuid: For UUID generation.
 * - internal/domain, internal/store: For domain models and data access.
 * - pkg/anchorclient, pkg/rabbitmq: For external service communication.
 */

package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/transfa/transaction-service/internal/domain"
	"github.com/transfa/transaction-service/internal/store"
	"github.com/transfa/transaction-service/pkg/anchorclient"
	"github.com/transfa/transaction-service/pkg/rabbitmq"
)

const (
	FreeTierTransferLimit = 5
	SubscriptionFee       = 100000 // 1000 NGN in kobo
	defaultTransactionFee = 500    // 5 NGN in kobo (failsafe)
)

// Service provides the core business logic for transactions.
type Service struct {
	repo               store.Repository
	anchorClient       *anchorclient.Client
	eventProducer      rabbitmq.Publisher
	adminAccountID     string
	transactionFeeKobo int64
}

// NewService creates a new transaction service instance.
func NewService(repo store.Repository, anchor *anchorclient.Client, producer rabbitmq.Publisher, adminAccountID string, transactionFeeKobo int64) *Service {
	if transactionFeeKobo <= 0 {
		log.Printf("INFO: Using default transaction fee %d kobo", defaultTransactionFee)
		transactionFeeKobo = defaultTransactionFee
	}

	if adminAccountID == "" {
		log.Printf("WARN: Admin account ID not provided; fee collection will be disabled")
	}

	return &Service{
		repo:               repo,
		anchorClient:       anchor,
		eventProducer:      producer,
		adminAccountID:     adminAccountID,
		transactionFeeKobo: transactionFeeKobo,
	}
}

// GetTransactionFee returns the configured transaction fee in kobo.
func (s *Service) GetTransactionFee() int64 {
	return s.transactionFeeKobo
}

// ResolveInternalUserID converts a Clerk user id string (e.g., "user_abc123") into the
// internal UUID used by our database. This allows handlers to accept Clerk subject ids
// from validated JWTs while our repositories continue to operate on UUIDs.
func (s *Service) ResolveInternalUserID(ctx context.Context, clerkUserID string) (string, error) {
	return s.repo.FindUserIDByClerkUserID(ctx, clerkUserID)
}

// ProcessP2PTransfer handles the logic for a peer-to-peer transfer.
func (s *Service) ProcessP2PTransfer(ctx context.Context, senderID uuid.UUID, req domain.P2PTransferRequest) (*domain.Transaction, error) {
	log.Printf("ProcessP2PTransfer: Starting transfer from %s to %s for amount %d", senderID, req.RecipientUsername, req.Amount)

	// 1. Get sender and recipient details
	sender, err := s.repo.FindUserByID(ctx, senderID)
	if err != nil {
		log.Printf("ProcessP2PTransfer: Failed to find sender %s: %v", senderID, err)
		return nil, fmt.Errorf("failed to find sender: %w", err)
	}
	log.Printf("ProcessP2PTransfer: Found sender %s (allow_sending: %v)", sender.ID, sender.AllowSending)

	recipient, err := s.repo.FindUserByUsername(ctx, req.RecipientUsername)
	if err != nil {
		log.Printf("ProcessP2PTransfer: Failed to find recipient %s: %v", req.RecipientUsername, err)
		return nil, fmt.Errorf("failed to find recipient: %w", err)
	}
	log.Printf("ProcessP2PTransfer: Found recipient %s", recipient.ID)

	// 2. Validate sender permissions and funds
	if !sender.AllowSending {
		log.Printf("ProcessP2PTransfer: Sender %s is not permitted to send funds", sender.ID)
		return nil, errors.New("sender account is not permitted to send funds")
	}
	senderAccount, err := s.repo.FindAccountByUserID(ctx, sender.ID)
	if err != nil {
		log.Printf("ProcessP2PTransfer: Failed to find sender account for %s: %v", sender.ID, err)
		return nil, fmt.Errorf("failed to find sender account: %w", err)
	}

	// Sync the internal database balance with Anchor before validation
	if err := s.syncAccountBalance(ctx, sender.ID); err != nil {
		log.Printf("ProcessP2PTransfer: Failed to sync balance for %s: %v", sender.ID, err)
		// Continue with validation even if sync fails, but log the warning
	}

	// Get the actual balance from Anchor API for validation
	anchorBalance, err := s.anchorClient.GetAccountBalance(ctx, senderAccount.AnchorAccountID)
	if err != nil {
		log.Printf("ProcessP2PTransfer: Failed to get Anchor balance for %s: %v", sender.ID, err)
		return nil, fmt.Errorf("failed to get account balance from Anchor: %w", err)
	}

	availableBalance := anchorBalance.Data.AvailableBalance
	requiredAmount := req.Amount + s.transactionFeeKobo
	log.Printf("ProcessP2PTransfer: Sender Anchor balance: %d, required: %d", availableBalance, requiredAmount)

	if availableBalance < requiredAmount {
		log.Printf("ProcessP2PTransfer: Insufficient funds for sender %s (Anchor balance: %d, required: %d)", sender.ID, availableBalance, requiredAmount)
		return nil, store.ErrInsufficientFunds
	}

	// 3. Debit the sender's wallet immediately to lock funds
	if err := s.repo.DebitWallet(ctx, sender.ID, req.Amount+s.transactionFeeKobo); err != nil {
		return nil, fmt.Errorf("failed to debit sender wallet: %w", err)
	}

	// 4. Create initial transaction record
	txRecord := &domain.Transaction{
		ID:              uuid.New(),
		SenderID:        sender.ID,
		RecipientID:     &recipient.ID,
		SourceAccountID: senderAccount.ID,
		Type:            "p2p",
		Status:          "pending",
		Amount:          req.Amount,
		Fee:             s.transactionFeeKobo,
		Description:     req.Description,
		Category:        "p2p_transfer",
	}
	if err := s.repo.CreateTransaction(ctx, txRecord); err != nil {
		// Refund the debited amount since transaction creation failed
		if refundErr := s.repo.CreditWallet(ctx, sender.ID, req.Amount+s.transactionFeeKobo); refundErr != nil {
			log.Printf("CRITICAL: Failed to refund debited amount for user %s after transaction creation failure: %v", sender.ID, refundErr)
		}
		return nil, fmt.Errorf("failed to create transaction record: %w", err)
	}

	// 3.5. Collect the transaction fee to admin account
	if err := s.collectTransactionFee(ctx, txRecord, senderAccount, s.transactionFeeKobo, "P2P Transfer Fee"); err != nil {
		log.Printf("WARN: Failed to collect transaction fee: %v", err)
		// Don't fail the transaction, just log the warning
	}

	// 5. Determine routing based on recipient's receiving preference and eligibility
	recipientPreference, err := s.repo.FindOrCreateReceivingPreference(ctx, recipient.ID)
	if err != nil {
		log.Printf("WARN: could not get recipient preference for %s: %v. Defaulting to internal transfer.", recipient.ID, err)
		recipientPreference = &domain.UserReceivingPreference{UseExternalAccount: false}
	} else {
		log.Printf("ProcessP2PTransfer: Recipient %s preference - use_external: %v, default_beneficiary_id: %v", recipient.ID, recipientPreference.UseExternalAccount, recipientPreference.DefaultBeneficiaryID)
	}

	var anchorResp *anchorclient.TransferResponse

	if recipientPreference.UseExternalAccount {
		// Check if recipient is eligible for external transfers
		isEligibleForExternal, err := s.checkRecipientEligibility(ctx, recipient.ID)
		if err != nil {
			log.Printf("WARN: could not check recipient eligibility for %s: %v. Defaulting to internal transfer.", recipient.ID, err)
			isEligibleForExternal = false
		}

		if isEligibleForExternal {
			// Route externally via NIP Transfer
			var recipientBeneficiary *domain.Beneficiary
			if recipientPreference.DefaultBeneficiaryID != nil {
				// Use the preferred beneficiary
				recipientBeneficiary, err = s.repo.FindBeneficiaryByID(ctx, *recipientPreference.DefaultBeneficiaryID, recipient.ID)
				if err != nil {
					log.Printf("WARN: recipient %s preferred beneficiary not found: %v. Using first beneficiary.", recipient.ID, err)
					recipientBeneficiary, err = s.repo.FindOrCreateDefaultBeneficiary(ctx, recipient.ID)
				}
			} else {
				// Use first beneficiary as default
				recipientBeneficiary, err = s.repo.FindOrCreateDefaultBeneficiary(ctx, recipient.ID)
			}

			if err != nil || recipientBeneficiary == nil {
				log.Printf("WARN: recipient %s wants external transfer but has no beneficiary. Rerouting internally.", recipient.ID)
				reason := fmt.Sprintf("P2P Transfer to %s", req.RecipientUsername)
				if req.Description != "" {
					reason = fmt.Sprintf("P2P Transfer to %s: %s", req.RecipientUsername, req.Description)
				}
				anchorResp, err = s.performInternalTransfer(ctx, txRecord, senderAccount, recipient, reason)
			} else {
				txRecord.DestinationBeneficiaryID = &recipientBeneficiary.ID
				// Create a proper reason for Anchor API
				reason := fmt.Sprintf("P2P Transfer to %s", req.RecipientUsername)
				if req.Description != "" {
					reason = fmt.Sprintf("P2P Transfer to %s: %s", req.RecipientUsername, req.Description)
				}
				anchorResp, err = s.anchorClient.InitiateNIPTransfer(ctx, senderAccount.AnchorAccountID, recipientBeneficiary.AnchorCounterpartyID, reason, req.Amount)
				if err == nil {
					if updateErr := s.repo.UpdateTransactionDestinations(ctx, txRecord.ID, nil, &recipientBeneficiary.ID); updateErr != nil {
						log.Printf("WARN: Failed to persist destination beneficiary for transaction %s: %v", txRecord.ID, updateErr)
					}
				}

				// Increment monthly usage for free tier recipients when external transfer is successful
				if err == nil {
					sub, _ := s.repo.FindSubscriptionByUserID(ctx, recipient.ID)
					if sub == nil || sub.Status != "active" {
						// Free tier user - increment their monthly external receipt count
						now := time.Now().UTC()
						period := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
						if incrementErr := s.repo.IncrementMonthlyUsage(ctx, recipient.ID, period); incrementErr != nil {
							log.Printf("WARN: Failed to increment monthly usage for recipient %s: %v", recipient.ID, incrementErr)
							// Don't fail the transaction, just log the warning
						}
					}
				}
			}
		} else {
			// Recipient wants external but is not eligible - route internally
			reason := fmt.Sprintf("P2P Transfer to %s", req.RecipientUsername)
			if req.Description != "" {
				reason = fmt.Sprintf("P2P Transfer to %s: %s", req.RecipientUsername, req.Description)
			}
			anchorResp, err = s.performInternalTransfer(ctx, txRecord, senderAccount, recipient, reason)
		}
	} else {
		// Recipient prefers internal wallet - route internally
		reason := fmt.Sprintf("P2P Transfer to %s", req.RecipientUsername)
		if req.Description != "" {
			reason = fmt.Sprintf("P2P Transfer to %s: %s", req.RecipientUsername, req.Description)
		}
		anchorResp, err = s.performInternalTransfer(ctx, txRecord, senderAccount, recipient, reason)
	}

	// 6. Handle Anchor API response
	if err != nil {
		// If Anchor transfer fails, mark our transaction as failed.
		s.repo.UpdateTransactionStatus(ctx, txRecord.ID, "", "failed")
		// Refund the debited amount since Anchor transfer failed
		if refundErr := s.repo.CreditWallet(ctx, sender.ID, req.Amount+s.transactionFeeKobo); refundErr != nil {
			log.Printf("CRITICAL: Failed to refund debited amount for user %s after Anchor transfer failure: %v", sender.ID, refundErr)
		}
		return nil, fmt.Errorf("anchor transfer failed: %w", err)
	}

	// 7. Update transaction with final status from Anchor
	s.repo.UpdateTransactionStatusAndFee(ctx, txRecord.ID, anchorResp.Data.ID, "completed", txRecord.Fee)
	txRecord.Status = "completed"

	return txRecord, nil
}

// performInternalTransfer executes a book transfer and updates the transaction record.
func (s *Service) performInternalTransfer(ctx context.Context, txRecord *domain.Transaction, senderAccount *domain.Account, recipient *domain.User, reason string) (*anchorclient.TransferResponse, error) {
	recipientAccount, err := s.repo.FindAccountByUserID(ctx, recipient.ID)
	if err != nil {
		return nil, fmt.Errorf("could not find recipient's internal account: %w", err)
	}

	// Set the destination account ID for internal transfers
	txRecord.DestinationAccountID = &recipientAccount.ID
	txRecord.RecipientID = &recipient.ID

	// Publish event that transfer was rerouted
	if s.eventProducer != nil {
		s.eventProducer.Publish(ctx, "transfa.events", "transfer.rerouted.internal", domain.ReroutedInternalPayload{
			RecipientID: recipient.ID,
			SenderID:    txRecord.SenderID,
			Amount:      txRecord.Amount,
			Reason:      reason,
		})
	}

	transferResp, err := s.anchorClient.InitiateBookTransfer(ctx, senderAccount.AnchorAccountID, recipientAccount.AnchorAccountID, reason, txRecord.Amount)
	if err != nil {
		return nil, err
	}

	if err := s.repo.UpdateTransactionDestinations(ctx, txRecord.ID, &recipientAccount.ID, nil); err != nil {
		log.Printf("WARN: Failed to persist destination account for transaction %s: %v", txRecord.ID, err)
	}

	return transferResp, nil
}

// checkRecipientEligibility checks if a recipient can receive an external transfer.
func (s *Service) checkRecipientEligibility(ctx context.Context, recipientID uuid.UUID) (bool, error) {
	sub, err := s.repo.FindSubscriptionByUserID(ctx, recipientID)
	if err != nil && !errors.Is(err, store.ErrSubscriptionNotFound) {
		return false, err
	}
	if sub != nil && sub.Status == "active" {
		return true, nil // Subscribed users are always eligible.
	}

	// For non-subscribed users, check monthly usage.
	now := time.Now().UTC()
	period := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	usage, err := s.repo.FindOrCreateMonthlyUsage(ctx, recipientID, period)
	if err != nil {
		return false, err
	}

	return usage.ExternalReceiptCount < FreeTierTransferLimit, nil
}

// ProcessSelfTransfer handles the logic for a withdrawal to an external account.
func (s *Service) ProcessSelfTransfer(ctx context.Context, senderID uuid.UUID, req domain.SelfTransferRequest) (*domain.Transaction, error) {
	// 1. Get sender and beneficiary details
	sender, err := s.repo.FindUserByID(ctx, senderID)
	if err != nil {
		return nil, fmt.Errorf("failed to find sender: %w", err)
	}
	beneficiary, err := s.repo.FindBeneficiaryByID(ctx, req.BeneficiaryID, senderID)
	if err != nil {
		return nil, fmt.Errorf("failed to find beneficiary: %w", err)
	}

	// 2. Validate sender permissions and funds
	if !sender.AllowSending {
		return nil, errors.New("sender account is not permitted to send funds")
	}
	senderAccount, err := s.repo.FindAccountByUserID(ctx, sender.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to find sender account: %w", err)
	}

	// Sync the internal database balance with Anchor before validation
	if err := s.syncAccountBalance(ctx, sender.ID); err != nil {
		log.Printf("ProcessSelfTransfer: Failed to sync balance for %s: %v", sender.ID, err)
		// Continue with validation even if sync fails, but log the warning
	}

	// Get the actual balance from Anchor API for validation
	anchorBalance, err := s.anchorClient.GetAccountBalance(ctx, senderAccount.AnchorAccountID)
	if err != nil {
		log.Printf("ProcessSelfTransfer: Failed to get Anchor balance for %s: %v", sender.ID, err)
		return nil, fmt.Errorf("failed to get account balance from Anchor: %w", err)
	}

	availableBalance := anchorBalance.Data.AvailableBalance
	requiredAmount := req.Amount + s.transactionFeeKobo
	log.Printf("ProcessSelfTransfer: Sender Anchor balance: %d, required: %d", availableBalance, requiredAmount)

	if availableBalance < requiredAmount {
		log.Printf("ProcessSelfTransfer: Insufficient funds for sender %s (Anchor balance: %d, required: %d)", sender.ID, availableBalance, requiredAmount)
		return nil, store.ErrInsufficientFunds
	}

	// 3. Debit sender's wallet to lock funds
	if err := s.repo.DebitWallet(ctx, sender.ID, req.Amount+s.transactionFeeKobo); err != nil {
		return nil, fmt.Errorf("failed to debit sender wallet: %w", err)
	}

	// 4. Create initial transaction record
	txRecord := &domain.Transaction{
		ID:                       uuid.New(),
		SenderID:                 sender.ID,
		SourceAccountID:          senderAccount.ID,
		DestinationBeneficiaryID: &beneficiary.ID,
		Type:                     "self_transfer",
		Status:                   "pending",
		Amount:                   req.Amount,
		Fee:                      s.transactionFeeKobo,
		Description:              req.Description,
		Category:                 "self_transfer",
	}
	if err := s.repo.CreateTransaction(ctx, txRecord); err != nil {
		// Refund the debited amount since transaction creation failed
		if refundErr := s.repo.CreditWallet(ctx, sender.ID, req.Amount+s.transactionFeeKobo); refundErr != nil {
			log.Printf("CRITICAL: Failed to refund debited amount for user %s after transaction creation failure: %v", sender.ID, refundErr)
		}
		return nil, fmt.Errorf("failed to create transaction record: %w", err)
	}

	// 3.5. Collect the transaction fee to admin account
	if err := s.collectTransactionFee(ctx, txRecord, senderAccount, s.transactionFeeKobo, "Self Transfer Fee"); err != nil {
		log.Printf("WARN: Failed to collect transaction fee: %v", err)
		// Don't fail the transaction, just log the warning
	}

	// 5. Initiate NIP transfer via Anchor
	// Create a proper reason for Anchor API
	reason := "Self Transfer"
	if req.Description != "" {
		reason = fmt.Sprintf("Self Transfer: %s", req.Description)
	}

	anchorResp, err := s.anchorClient.InitiateNIPTransfer(ctx, senderAccount.AnchorAccountID, beneficiary.AnchorCounterpartyID, reason, req.Amount)
	if err != nil {
		// Mark transaction as failed and refund
		s.repo.UpdateTransactionStatus(ctx, txRecord.ID, "", "failed")
		// Refund the debited amount since Anchor transfer failed
		if refundErr := s.repo.CreditWallet(ctx, sender.ID, req.Amount+s.transactionFeeKobo); refundErr != nil {
			log.Printf("CRITICAL: Failed to refund debited amount for user %s after Anchor transfer failure: %v", sender.ID, refundErr)
		}
		return nil, fmt.Errorf("anchor NIP transfer failed: %w", err)
	}

	// 6. Update transaction with final status
	s.repo.UpdateTransactionStatusAndFee(ctx, txRecord.ID, anchorResp.Data.ID, "completed", txRecord.Fee)
	txRecord.Status = "completed"

	return txRecord, nil
}

// GetUserBeneficiaries retrieves all beneficiaries for a user.
func (s *Service) GetUserBeneficiaries(ctx context.Context, userID uuid.UUID) ([]domain.Beneficiary, error) {
	return s.repo.FindBeneficiariesByUserID(ctx, userID)
}

// GetDefaultBeneficiary retrieves the default beneficiary for a user using smart logic.
func (s *Service) GetDefaultBeneficiary(ctx context.Context, userID uuid.UUID) (*domain.Beneficiary, error) {
	return s.repo.FindOrCreateDefaultBeneficiary(ctx, userID)
}

// SetDefaultBeneficiary sets a specific beneficiary as the default for a user.
// This is primarily used by subscribed users to explicitly choose their default.
func (s *Service) SetDefaultBeneficiary(ctx context.Context, userID uuid.UUID, beneficiaryID uuid.UUID) error {
	return s.repo.SetDefaultBeneficiary(ctx, userID, beneficiaryID)
}

// GetReceivingPreference retrieves a user's receiving preference.
func (s *Service) GetReceivingPreference(ctx context.Context, userID uuid.UUID) (*domain.UserReceivingPreference, error) {
	return s.repo.FindOrCreateReceivingPreference(ctx, userID)
}

// UpdateReceivingPreference updates a user's receiving preference.
func (s *Service) UpdateReceivingPreference(ctx context.Context, userID uuid.UUID, useExternal bool, beneficiaryID *uuid.UUID) error {
	return s.repo.UpdateReceivingPreference(ctx, userID, useExternal, beneficiaryID)
}

// GetAccountBalance retrieves the current balance for a user's account.
func (s *Service) GetAccountBalance(ctx context.Context, userID uuid.UUID) (*domain.AccountBalance, error) {
	// Get the user's account from the database
	account, err := s.repo.FindAccountByUserID(ctx, userID)
	if err != nil {
		log.Printf("Failed to find account for user %s: %v", userID, err)
		return nil, err
	}

	log.Printf("Fetching balance for account %s (Anchor ID: %s)", account.ID, account.AnchorAccountID)

	// Fetch the balance from Anchor API
	anchorBalance, err := s.anchorClient.GetAccountBalance(ctx, account.AnchorAccountID)
	if err != nil {
		log.Printf("Failed to fetch balance from Anchor for account %s: %v", account.AnchorAccountID, err)
		return nil, fmt.Errorf("failed to fetch balance from Anchor: %w", err)
	}

	log.Printf("Successfully fetched balance from Anchor: %+v", anchorBalance)

	// Sync the internal database with the Anchor balance
	if err := s.syncAccountBalance(ctx, userID); err != nil {
		log.Printf("WARN: Failed to sync balance for user %s: %v", userID, err)
		// Continue even if sync fails, but log the warning
	}

	// Convert Anchor balance to our domain model
	balance := &domain.AccountBalance{
		AvailableBalance: anchorBalance.Data.AvailableBalance,
		LedgerBalance:    anchorBalance.Data.LedgerBalance,
		Hold:             anchorBalance.Data.Hold,
		Pending:          anchorBalance.Data.Pending,
	}

	log.Printf("Converted balance: %+v", balance)
	return balance, nil
}

// GetTransactionHistory retrieves the transaction history for a user.
func (s *Service) GetTransactionHistory(ctx context.Context, userID uuid.UUID) ([]domain.Transaction, error) {
	return s.repo.FindTransactionsByUserID(ctx, userID)
}

// ProcessSubscriptionFee handles the logic for debiting subscription fees.
// This is called by the scheduler-service for monthly billing.
func (s *Service) ProcessSubscriptionFee(ctx context.Context, userID uuid.UUID, amount int64, reason string) (*domain.Transaction, error) {
	// 1. Get user details
	user, err := s.repo.FindUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to find user: %w", err)
	}

	// 2. Validate user permissions and funds
	if !user.AllowSending {
		return nil, errors.New("user account is not permitted to send funds")
	}
	userAccount, err := s.repo.FindAccountByUserID(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to find user account: %w", err)
	}
	if userAccount.Balance < amount {
		return nil, store.ErrInsufficientFunds
	}

	// 3. Debit the user's wallet immediately to lock funds
	if err := s.repo.DebitWallet(ctx, user.ID, amount); err != nil {
		return nil, fmt.Errorf("failed to debit user wallet: %w", err)
	}

	// 4. Create transaction record for subscription fee
	txRecord := &domain.Transaction{
		ID:              uuid.New(),
		SenderID:        user.ID,
		SourceAccountID: userAccount.ID,
		Type:            "subscription_fee",
		Status:          "completed", // Subscription fees are immediately completed
		Amount:          amount,
		Fee:             0, // No additional fee for subscription billing
		Description:     reason,
	}
	if err := s.repo.CreateTransaction(ctx, txRecord); err != nil {
		// Refund the debited amount since transaction creation failed
		if refundErr := s.repo.CreditWallet(ctx, user.ID, amount); refundErr != nil {
			log.Printf("CRITICAL: Failed to refund debited amount for user %s after subscription fee transaction creation failure: %v", user.ID, refundErr)
		}
		return nil, fmt.Errorf("failed to create subscription fee transaction record: %w", err)
	}

	// 5. Publish subscription fee event to RabbitMQ for other services
	event := rabbitmq.SubscriptionFeeEvent{
		UserID:    user.ID,
		Amount:    amount,
		Reason:    reason,
		Timestamp: time.Now(),
	}
	if err := s.eventProducer.PublishSubscriptionFeeEvent(ctx, event); err != nil {
		log.Printf("WARN: Failed to publish subscription fee event for user %s: %v", user.ID, err)
		// Don't fail the transaction for this, as the fee was successfully debited
	}

	return txRecord, nil
}

// CreatePaymentRequest handles the business logic for creating a new payment request.
func (s *Service) CreatePaymentRequest(ctx context.Context, creatorID uuid.UUID, payload domain.CreatePaymentRequestPayload) (*domain.PaymentRequest, error) {
	// Create the domain object for the new request.
	newRequest := &domain.PaymentRequest{
		ID:          uuid.New(),
		CreatorID:   creatorID,
		Status:      "pending", // Initial status is always pending.
		Amount:      payload.Amount,
		Description: payload.Description,
		ImageURL:    payload.ImageURL,
	}

	// Persist the new request to the database via the repository.
	return s.repo.CreatePaymentRequest(ctx, newRequest)
}

// ListPaymentRequests retrieves all payment requests for a given user.
func (s *Service) ListPaymentRequests(ctx context.Context, creatorID uuid.UUID) ([]domain.PaymentRequest, error) {
	return s.repo.ListPaymentRequestsByCreator(ctx, creatorID)
}

// GetPaymentRequestByID retrieves a single payment request by its ID.
func (s *Service) GetPaymentRequestByID(ctx context.Context, requestID uuid.UUID) (*domain.PaymentRequest, error) {
	return s.repo.GetPaymentRequestByID(ctx, requestID)
}

// collectTransactionFee transfers the transaction fee to the admin account.
func (s *Service) collectTransactionFee(ctx context.Context, parentTx *domain.Transaction, sourceAccount *domain.Account, amount int64, description string) error {
	if s.adminAccountID == "" {
		log.Printf("WARN: Admin account ID not configured; skipping fee collection")
		return nil
	}

	if sourceAccount == nil {
		return fmt.Errorf("source account is nil")
	}

	log.Printf("Collecting transaction fee of %d from %s to admin account %s", amount, sourceAccount.AnchorAccountID, s.adminAccountID)

	// Get the admin account balance to verify it exists
	adminBalance, err := s.anchorClient.GetAccountBalance(ctx, s.adminAccountID)
	if err != nil {
		log.Printf("Failed to get admin account balance: %v", err)
		return fmt.Errorf("failed to get admin account balance: %w", err)
	}

	log.Printf("Admin account current balance: %d", adminBalance.Data.AvailableBalance)

	// Perform the actual transfer from source account to admin account
	transferResp, err := s.anchorClient.InitiateBookTransfer(ctx, sourceAccount.AnchorAccountID, s.adminAccountID, description, amount)
	if err != nil {
		log.Printf("Failed to transfer fee to admin account: %v", err)
		return fmt.Errorf("failed to transfer fee to admin account: %w", err)
	}

	log.Printf("Fee transfer successful: %s", transferResp.Data.ID)

	// Create a fee collection transaction record for the admin account
	// Update parent transaction destination fields when fee collection targets admin account
	log.Printf("Fee collection recorded for transaction %s: amount=%d, transfer_id=%s", parentTx.ID, amount, transferResp.Data.ID)

	return nil
}

// syncAccountBalance synchronizes the internal database balance with Anchor API
func (s *Service) syncAccountBalance(ctx context.Context, userID uuid.UUID) error {
	// Get the account from internal database
	account, err := s.repo.FindAccountByUserID(ctx, userID)
	if err != nil {
		return fmt.Errorf("failed to find account: %w", err)
	}

	// Get the current balance from Anchor
	anchorBalance, err := s.anchorClient.GetAccountBalance(ctx, account.AnchorAccountID)
	if err != nil {
		return fmt.Errorf("failed to get balance from Anchor: %w", err)
	}

	// Update the internal database with the Anchor balance
	newBalance := anchorBalance.Data.AvailableBalance
	if account.Balance != newBalance {
		log.Printf("Syncing balance for user %s: internal=%d, anchor=%d", userID, account.Balance, newBalance)

		if err := s.repo.UpdateAccountBalance(ctx, userID, newBalance); err != nil {
			return fmt.Errorf("failed to update account balance: %w", err)
		}

		log.Printf("Successfully synced balance for user %s to %d", userID, newBalance)
	}

	return nil
}
