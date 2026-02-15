/**
 * @description
 * This file contains the core business logic for the transaction-service. The `Service`
 * struct orchestrates all money movement operations, coordinating between the database
 * repository, the Anchor BaaS API client, and the message broker.
 *
 * Key features:
 * - Implements the main use cases: P2P transfers and self-transfers.
 * - Contains the critical platform-fee routing logic for P2P payments.
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
	"github.com/transfa/transaction-service/pkg/accountclient"
	"github.com/transfa/transaction-service/pkg/anchorclient"
	rmrabbit "github.com/transfa/transaction-service/pkg/rabbitmq"
	"golang.org/x/crypto/bcrypt"
)

const (
	defaultTransactionFee = 500
	pinMaxAttempts        = 5
	pinLockoutSeconds     = 900
)

var (
	ErrInvalidTransactionPIN = errors.New("invalid transaction pin")
	ErrTransactionPINLocked  = errors.New("transaction pin temporarily locked")
)

// Service provides the core business logic for transactions.
type Service struct {
	repo               store.Repository
	anchorClient       *anchorclient.Client
	accountClient      *accountclient.Client
	eventProducer      rmrabbit.Publisher
	transferConsumer   *TransferStatusConsumer
	adminAccountID     string
	transactionFeeKobo int64
	moneyDropFeeKobo   int64
}

func NewService(repo store.Repository, anchor *anchorclient.Client, accountClient *accountclient.Client, producer rmrabbit.Publisher, adminAccountID string, transactionFeeKobo int64, moneyDropFeeKobo int64) *Service {
	if transactionFeeKobo <= 0 {
		log.Printf("level=info component=service msg=\"using default transaction fee\" fee_kobo=%d", defaultTransactionFee)
		transactionFeeKobo = defaultTransactionFee
	}

	if adminAccountID == "" {
		log.Printf("level=warn component=service msg=\"admin account not configured; fee collection disabled\"")
	}

	svc := &Service{
		repo:               repo,
		anchorClient:       anchor,
		accountClient:      accountClient,
		eventProducer:      producer,
		adminAccountID:     adminAccountID,
		transactionFeeKobo: transactionFeeKobo,
		moneyDropFeeKobo:   moneyDropFeeKobo,
	}

	svc.transferConsumer = NewTransferStatusConsumer(repo)

	return svc
}

func (s *Service) TransferStatusConsumer() *TransferStatusConsumer {
	return s.transferConsumer
}

// GetTransactionFee returns the configured transaction fee in kobo.
func (s *Service) GetTransactionFee() int64 {
	return s.transactionFeeKobo
}

// GetMoneyDropFee returns the configured money drop creation fee in kobo.
func (s *Service) GetMoneyDropFee() int64 {
	return s.moneyDropFeeKobo
}

// ResolveInternalUserID converts a Clerk user id string (e.g., "user_abc123") into the
// internal UUID used by our database. This allows handlers to accept Clerk subject ids
// from validated JWTs while our repositories continue to operate on UUIDs.
func (s *Service) ResolveInternalUserID(ctx context.Context, clerkUserID string) (string, error) {
	return s.repo.FindUserIDByClerkUserID(ctx, clerkUserID)
}

// VerifyTransactionPIN validates the user-provided PIN against server-side hash and lockout state.
func (s *Service) VerifyTransactionPIN(ctx context.Context, userID uuid.UUID, pin string) error {
	if len(pin) != 4 {
		return ErrInvalidTransactionPIN
	}
	for _, c := range pin {
		if c < '0' || c > '9' {
			return ErrInvalidTransactionPIN
		}
	}

	credential, err := s.repo.GetUserSecurityCredentialByUserID(ctx, userID)
	if err != nil {
		return err
	}

	now := time.Now().UTC()
	if credential.LockedUntil != nil && credential.LockedUntil.After(now) {
		return ErrTransactionPINLocked
	}

	if bcrypt.CompareHashAndPassword([]byte(credential.TransactionPINHash), []byte(pin)) != nil {
		updatedCredential, recordErr := s.repo.RecordFailedTransactionPINAttempt(ctx, userID, pinMaxAttempts, pinLockoutSeconds)
		if recordErr != nil {
			return recordErr
		}
		if updatedCredential.LockedUntil != nil && updatedCredential.LockedUntil.After(now) {
			return ErrTransactionPINLocked
		}
		return ErrInvalidTransactionPIN
	}

	if credential.FailedAttempts > 0 || credential.LockedUntil != nil {
		if err := s.repo.ResetTransactionPINFailureState(ctx, userID); err != nil {
			log.Printf("level=warn component=service flow=pin_verify msg=\"failed to reset pin failure state\" user_id=%s err=%v", userID, err)
		}
	}

	return nil
}

// ProcessP2PTransfer handles the logic for a peer-to-peer transfer.
func (s *Service) ProcessP2PTransfer(ctx context.Context, senderID uuid.UUID, req domain.P2PTransferRequest) (*domain.Transaction, error) {
	// 1. Get sender and recipient details
	sender, err := s.repo.FindUserByID(ctx, senderID)
	if err != nil {
		return nil, fmt.Errorf("failed to find sender: %w", err)
	}

	recipient, err := s.repo.FindUserByUsername(ctx, req.RecipientUsername)
	if err != nil {
		return nil, fmt.Errorf("failed to find recipient: %w", err)
	}

	senderDelinquent := false
	if delinquent, err := s.repo.IsUserDelinquent(ctx, sender.ID); err != nil {
		log.Printf("level=warn component=service flow=p2p_transfer msg=\"platform-fee status lookup failed; treating sender as delinquent\" sender_id=%s err=%v", sender.ID, err)
		senderDelinquent = true
	} else {
		senderDelinquent = delinquent
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
		log.Printf("level=warn component=service flow=p2p_transfer msg=\"balance sync failed\" sender_id=%s err=%v", sender.ID, err)
		// Continue with validation even if sync fails, but log the warning
	}

	// Get the actual balance from Anchor API for validation
	anchorBalance, err := s.anchorClient.GetAccountBalance(ctx, senderAccount.AnchorAccountID)
	if err != nil {
		return nil, fmt.Errorf("failed to get account balance from Anchor: %w", err)
	}

	availableBalance := anchorBalance.Data.AvailableBalance
	requiredAmount := req.Amount + s.transactionFeeKobo

	if availableBalance < requiredAmount {
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
			log.Printf("level=error component=service flow=p2p_transfer msg=\"wallet refund failed after tx record creation error\" sender_id=%s err=%v", sender.ID, refundErr)
		}
		return nil, fmt.Errorf("failed to create transaction record: %w", err)
	}

	// 3.5. Collect the transaction fee to admin account
	if err := s.collectTransactionFee(ctx, txRecord, senderAccount, s.transactionFeeKobo, "P2P Transfer Fee"); err != nil {
		log.Printf("level=warn component=service flow=p2p_transfer msg=\"fee collection failed\" transaction_id=%s err=%v", txRecord.ID, err)
		// Don't fail the transaction, just log the warning
	}

	// 5. Determine routing based on recipient's receiving preference and eligibility
	recipientPreference, err := s.repo.FindOrCreateReceivingPreference(ctx, recipient.ID)
	if err != nil {
		log.Printf("level=warn component=service flow=p2p_transfer msg=\"recipient preference lookup failed; routing internal\" recipient_id=%s err=%v", recipient.ID, err)
		recipientPreference = &domain.UserReceivingPreference{UseExternalAccount: false}
	}

	var anchorResp *anchorclient.TransferResponse

	if recipientPreference.UseExternalAccount {
		// Check if recipient is eligible for external transfers
		isEligibleForExternal, err := s.checkRecipientEligibility(ctx, recipient.ID)
		if err != nil {
			log.Printf("level=warn component=service flow=p2p_transfer msg=\"recipient eligibility lookup failed; routing internal\" recipient_id=%s err=%v", recipient.ID, err)
			isEligibleForExternal = false
		}

		if isEligibleForExternal && !senderDelinquent {
			// Route externally via NIP Transfer
			var recipientBeneficiary *domain.Beneficiary
			if recipientPreference.DefaultBeneficiaryID != nil {
				// Use the preferred beneficiary
				recipientBeneficiary, err = s.repo.FindBeneficiaryByID(ctx, *recipientPreference.DefaultBeneficiaryID, recipient.ID)
				if err != nil {
					log.Printf("level=warn component=service flow=p2p_transfer msg=\"preferred beneficiary missing; using default\" recipient_id=%s err=%v", recipient.ID, err)
					recipientBeneficiary, err = s.repo.FindOrCreateDefaultBeneficiary(ctx, recipient.ID)
				}
			} else {
				// Use first beneficiary as default
				recipientBeneficiary, err = s.repo.FindOrCreateDefaultBeneficiary(ctx, recipient.ID)
			}

			if err != nil || recipientBeneficiary == nil {
				log.Printf("level=warn component=service flow=p2p_transfer msg=\"recipient external preference set but no beneficiary; routing internal\" recipient_id=%s", recipient.ID)
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
						log.Printf("level=warn component=service flow=p2p_transfer msg=\"failed to persist destination beneficiary\" transaction_id=%s err=%v", txRecord.ID, updateErr)
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
			log.Printf("level=error component=service flow=p2p_transfer msg=\"wallet refund failed after anchor transfer error\" sender_id=%s transaction_id=%s err=%v", sender.ID, txRecord.ID, refundErr)
		}
		return nil, fmt.Errorf("anchor transfer failed: %w", err)
	}

	// 7. Update transaction metadata; final status driven by webhook
	if anchorResp != nil {
		transferID := anchorResp.Data.ID
		txRecord.AnchorTransferID = &transferID
		if txRecord.TransferType == "" {
			txRecord.TransferType = "nip"
		}

		metadata := store.UpdateTransactionMetadataParams{
			AnchorTransferID: &transferID,
		}
		statusPending := "pending"
		metadata.Status = &statusPending
		if txRecord.TransferType != "" {
			typeCopy := txRecord.TransferType
			metadata.TransferType = &typeCopy
		}

		if err := s.repo.UpdateTransactionMetadata(ctx, txRecord.ID, metadata); err != nil {
			log.Printf("level=warn component=service flow=p2p_transfer msg=\"failed to persist transfer metadata\" transaction_id=%s err=%v", txRecord.ID, err)
		}
	}

	txRecord.Status = "pending"

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
		log.Printf("level=warn component=service flow=p2p_transfer msg=\"failed to persist destination account\" transaction_id=%s err=%v", txRecord.ID, err)
	}

	if transferResp != nil {
		transferID := transferResp.Data.ID
		txRecord.AnchorTransferID = &transferID
		txRecord.TransferType = "book"
	}

	return transferResp, nil
}

// checkRecipientEligibility checks if a recipient can receive an external transfer.
func (s *Service) checkRecipientEligibility(ctx context.Context, recipientID uuid.UUID) (bool, error) {
	delinquent, err := s.repo.IsUserDelinquent(ctx, recipientID)
	if err != nil {
		return false, err
	}

	return !delinquent, nil
}

// ProcessSelfTransfer handles the logic for a withdrawal to an external account.
func (s *Service) ProcessSelfTransfer(ctx context.Context, senderID uuid.UUID, req domain.SelfTransferRequest) (*domain.Transaction, error) {
	// 1. Get sender and beneficiary details
	sender, err := s.repo.FindUserByID(ctx, senderID)
	if err != nil {
		return nil, fmt.Errorf("failed to find sender: %w", err)
	}
	// Block external withdrawals when platform fees are delinquent.
	delinquent, err := s.repo.IsUserDelinquent(ctx, sender.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to check platform fee status: %w", err)
	}
	if delinquent {
		return nil, store.ErrPlatformFeeDelinquent
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
		log.Printf("level=warn component=service flow=self_transfer msg=\"balance sync failed\" sender_id=%s err=%v", sender.ID, err)
		// Continue with validation even if sync fails, but log the warning
	}

	// Get the actual balance from Anchor API for validation
	anchorBalance, err := s.anchorClient.GetAccountBalance(ctx, senderAccount.AnchorAccountID)
	if err != nil {
		return nil, fmt.Errorf("failed to get account balance from Anchor: %w", err)
	}

	availableBalance := anchorBalance.Data.AvailableBalance
	requiredAmount := req.Amount + s.transactionFeeKobo

	if availableBalance < requiredAmount {
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
			log.Printf("level=error component=service flow=self_transfer msg=\"wallet refund failed after tx record creation error\" sender_id=%s err=%v", sender.ID, refundErr)
		}
		return nil, fmt.Errorf("failed to create transaction record: %w", err)
	}

	// 3.5. Collect the transaction fee to admin account
	if err := s.collectTransactionFee(ctx, txRecord, senderAccount, s.transactionFeeKobo, "Self Transfer Fee"); err != nil {
		log.Printf("level=warn component=service flow=self_transfer msg=\"fee collection failed\" transaction_id=%s err=%v", txRecord.ID, err)
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
			log.Printf("level=error component=service flow=self_transfer msg=\"wallet refund failed after anchor transfer error\" sender_id=%s transaction_id=%s err=%v", sender.ID, txRecord.ID, refundErr)
		}
		return nil, fmt.Errorf("anchor NIP transfer failed: %w", err)
	}

	// 6. Update transaction metadata; final status comes from webhook
	if anchorResp != nil {
		transferID := anchorResp.Data.ID
		txRecord.AnchorTransferID = &transferID
		txRecord.TransferType = "nip"

		metadata := store.UpdateTransactionMetadataParams{
			AnchorTransferID: &transferID,
		}
		statusPending := "pending"
		metadata.Status = &statusPending
		typeCopy := txRecord.TransferType
		metadata.TransferType = &typeCopy

		if err := s.repo.UpdateTransactionMetadata(ctx, txRecord.ID, metadata); err != nil {
			log.Printf("level=warn component=service flow=self_transfer msg=\"failed to persist transfer metadata\" transaction_id=%s err=%v", txRecord.ID, err)
		}
	}

	txRecord.Status = "pending"

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
		return nil, err
	}

	// Fetch the balance from Anchor API
	anchorBalance, err := s.anchorClient.GetAccountBalance(ctx, account.AnchorAccountID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch balance from Anchor: %w", err)
	}

	// Sync the internal database with the Anchor balance
	if err := s.syncAccountBalance(ctx, userID); err != nil {
		log.Printf("level=warn component=service flow=get_balance msg=\"balance sync failed\" user_id=%s err=%v", userID, err)
		// Continue even if sync fails, but log the warning
	}

	// Convert Anchor balance to our domain model
	balance := &domain.AccountBalance{
		AvailableBalance: anchorBalance.Data.AvailableBalance,
		LedgerBalance:    anchorBalance.Data.LedgerBalance,
		Hold:             anchorBalance.Data.Hold,
		Pending:          anchorBalance.Data.Pending,
	}

	return balance, nil
}

// GetTransactionHistory retrieves the transaction history for a user.
func (s *Service) GetTransactionHistory(ctx context.Context, userID uuid.UUID) ([]domain.Transaction, error) {
	return s.repo.FindTransactionsByUserID(ctx, userID)
}

// GetTransactionByID retrieves a single transaction by its ID, ensuring it belongs to the requester.
func (s *Service) GetTransactionByID(ctx context.Context, userID uuid.UUID, transactionID uuid.UUID) (*domain.Transaction, error) {
	tx, err := s.repo.FindTransactionByID(ctx, transactionID)
	if err != nil {
		return nil, err
	}

	if tx.SenderID != userID {
		if tx.RecipientID == nil || *tx.RecipientID != userID {
			return nil, store.ErrTransactionNotFound
		}
	}

	return tx, nil
}

// ProcessPlatformFee handles the logic for debiting platform fees.
// This is called by the platform-fee service for monthly billing.
func (s *Service) ProcessPlatformFee(ctx context.Context, userID uuid.UUID, amount int64, reason string) (*domain.Transaction, error) {
	user, err := s.repo.FindUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to find user: %w", err)
	}

	// Sync balances with Anchor before validating.
	if err := s.syncAccountBalance(ctx, user.ID); err != nil {
		log.Printf("level=warn component=service flow=platform_fee msg=\"balance sync failed\" user_id=%s err=%v", user.ID, err)
	}

	userAccount, err := s.repo.FindAccountByUserID(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to find user account: %w", err)
	}
	if userAccount.Balance < amount {
		return nil, store.ErrInsufficientFunds
	}

	if err := s.repo.DebitWallet(ctx, user.ID, amount); err != nil {
		return nil, fmt.Errorf("failed to debit user wallet: %w", err)
	}

	if s.adminAccountID == "" {
		_ = s.repo.CreditWallet(ctx, user.ID, amount)
		return nil, errors.New("admin account not configured for platform fee collection")
	}

	transferResp, err := s.anchorClient.InitiateBookTransfer(ctx, userAccount.AnchorAccountID, s.adminAccountID, reason, amount)
	if err != nil {
		if refundErr := s.repo.CreditWallet(ctx, user.ID, amount); refundErr != nil {
			log.Printf("level=error component=service flow=platform_fee msg=\"wallet refund failed after anchor transfer error\" user_id=%s err=%v", user.ID, refundErr)
		}
		return nil, fmt.Errorf("failed to transfer platform fee to admin account: %w", err)
	}

	var anchorTransferID *string
	transferType := "book"
	if transferResp != nil {
		anchorTransferID = &transferResp.Data.ID
	}

	txRecord := &domain.Transaction{
		ID:               uuid.New(),
		SenderID:         user.ID,
		SourceAccountID:  userAccount.ID,
		Type:             "platform_fee",
		Category:         "platform_fee",
		Status:           "completed",
		Amount:           amount,
		Fee:              0,
		Description:      reason,
		AnchorTransferID: anchorTransferID,
		TransferType:     transferType,
	}
	if err := s.repo.CreateTransaction(ctx, txRecord); err != nil {
		if anchorTransferID != nil {
			log.Printf("level=error component=service flow=platform_fee msg=\"anchor transfer completed but transaction record creation failed\" anchor_transfer_id=%s user_id=%s err=%v", *anchorTransferID, user.ID, err)
		} else {
			log.Printf("level=error component=service flow=platform_fee msg=\"transaction record creation failed\" user_id=%s err=%v", user.ID, err)
		}
		return nil, fmt.Errorf("failed to create platform fee transaction record: %w", err)
	}

	if s.eventProducer != nil {
		event := rmrabbit.PlatformFeeEvent{
			UserID:    user.ID,
			Amount:    amount,
			Reason:    reason,
			Timestamp: time.Now(),
		}
		if err := s.eventProducer.PublishPlatformFeeEvent(ctx, event); err != nil {
			log.Printf("level=warn component=service flow=platform_fee msg=\"failed to publish platform fee event\" user_id=%s err=%v", user.ID, err)
		}
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
		log.Printf("level=warn component=service flow=fee_collection msg=\"admin account not configured; skipping fee collection\"")
		return nil
	}

	if sourceAccount == nil {
		return fmt.Errorf("source account is nil")
	}

	// Get the admin account balance to verify it exists
	adminBalance, err := s.anchorClient.GetAccountBalance(ctx, s.adminAccountID)
	if err != nil {
		log.Printf("level=warn component=service flow=fee_collection msg=\"failed to get admin account balance\" err=%v", err)
		return fmt.Errorf("failed to get admin account balance: %w", err)
	}
	_ = adminBalance

	// Perform the actual transfer from source account to admin account
	transferResp, err := s.anchorClient.InitiateBookTransfer(ctx, sourceAccount.AnchorAccountID, s.adminAccountID, description, amount)
	if err != nil {
		log.Printf("level=warn component=service flow=fee_collection msg=\"anchor fee transfer failed\" err=%v", err)
		return fmt.Errorf("failed to transfer fee to admin account: %w", err)
	}
	if parentTx != nil {
		log.Printf("level=info component=service flow=fee_collection msg=\"fee transfer created\" transaction_id=%s amount=%d anchor_transfer_id=%s", parentTx.ID, amount, transferResp.Data.ID)
	}

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
		if err := s.repo.UpdateAccountBalance(ctx, userID, newBalance); err != nil {
			return fmt.Errorf("failed to update account balance: %w", err)
		}
	}

	return nil
}

// syncMoneyDropAccountBalance synchronizes the money drop account balance with Anchor API
func (s *Service) syncMoneyDropAccountBalance(ctx context.Context, accountID uuid.UUID, anchorAccountID string) error {
	if anchorAccountID == "" {
		return fmt.Errorf("money drop account has no Anchor account ID")
	}

	// Get the current balance from Anchor
	anchorBalance, err := s.anchorClient.GetAccountBalance(ctx, anchorAccountID)
	if err != nil {
		return fmt.Errorf("failed to get balance from Anchor: %w", err)
	}

	// Update the internal database with the Anchor balance
	newBalance := anchorBalance.Data.AvailableBalance
	if err := s.repo.UpdateMoneyDropAccountBalance(ctx, accountID, newBalance); err != nil {
		return fmt.Errorf("failed to update money drop account balance: %w", err)
	}
	return nil
}

// CreateMoneyDrop orchestrates the creation of a new money drop.
func (s *Service) CreateMoneyDrop(ctx context.Context, userID uuid.UUID, req domain.CreateMoneyDropRequest) (*domain.CreateMoneyDropResponse, error) {
	log.Printf("level=info component=service flow=money_drop_create msg=\"request accepted\" user_id=%s", userID)

	// 1. Get user's primary account and validate funds
	primaryAccount, err := s.repo.FindAccountByUserID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user's primary account: %w", err)
	}

	// Sync balance with Anchor before validation
	if err := s.syncAccountBalance(ctx, userID); err != nil {
		log.Printf("level=warn component=service flow=money_drop_create msg=\"balance sync failed\" user_id=%s err=%v", userID, err)
	}

	// Get actual balance from Anchor for validation
	anchorBalance, err := s.anchorClient.GetAccountBalance(ctx, primaryAccount.AnchorAccountID)
	if err != nil {
		return nil, fmt.Errorf("failed to get account balance from Anchor: %w", err)
	}

	totalAmount := req.AmountPerClaim * int64(req.NumberOfPeople)
	requiredAmount := totalAmount + s.moneyDropFeeKobo // Add fee to required amount

	if anchorBalance.Data.AvailableBalance < requiredAmount {
		return nil, errors.New("insufficient funds in primary wallet")
	}
	// 2. Get or create money drop account via account-service
	moneyDropAccount, err := s.repo.FindMoneyDropAccountByUserID(ctx, userID)
	if err != nil && !errors.Is(err, store.ErrAccountNotFound) {
		return nil, fmt.Errorf("failed to get user's money drop account: %w", err)
	}

	// If account doesn't exist or doesn't have Anchor account, create it via account-service
	if moneyDropAccount == nil || moneyDropAccount.AnchorAccountID == "" {
		log.Printf("level=info component=service flow=money_drop_create msg=\"creating money-drop anchor account\" user_id=%s", userID)
		accountResp, err := s.accountClient.CreateMoneyDropAccount(ctx, userID.String())
		if err != nil {
			return nil, fmt.Errorf("failed to create money drop Anchor account: %w", err)
		}
		log.Printf("level=info component=service flow=money_drop_create msg=\"money-drop anchor account created\" user_id=%s anchor_account_id=%s", userID, accountResp.AnchorAccountID)

		// Account-service already created/updated the account in the database
		// Re-fetch to get the updated account with Anchor details
		moneyDropAccount, err = s.repo.FindMoneyDropAccountByUserID(ctx, userID)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch money drop account after creation: %w", err)
		}
		if moneyDropAccount.AnchorAccountID == "" {
			return nil, fmt.Errorf("money drop account created but Anchor account ID is missing")
		}
	}

	// 3. Transfer funds from primary account to money drop account via Book Transfer
	reason := fmt.Sprintf("Money Drop Funding - Total: %d kobo", totalAmount)
	_, err = s.anchorClient.InitiateBookTransfer(ctx, primaryAccount.AnchorAccountID, moneyDropAccount.AnchorAccountID, reason, totalAmount)
	if err != nil {
		return nil, fmt.Errorf("failed to transfer funds to money drop account: %w", err)
	}
	log.Printf("level=info component=service flow=money_drop_create msg=\"funding transfer created\" user_id=%s amount=%d", userID, totalAmount)

	// 3.5. Sync money drop account balance after funding
	if err := s.syncMoneyDropAccountBalance(ctx, moneyDropAccount.ID, moneyDropAccount.AnchorAccountID); err != nil {
		log.Printf("level=warn component=service flow=money_drop_create msg=\"money-drop account sync failed after funding\" account_id=%s err=%v", moneyDropAccount.ID, err)
		// Don't fail the operation, balance will sync later
	}

	// 4. Debit required amount (total + fee) from primary account
	if err := s.repo.DebitWallet(ctx, userID, requiredAmount); err != nil {
		return nil, fmt.Errorf("failed to debit primary wallet: %w", err)
	}

	// 4.5. Collect the money drop creation fee to admin account (if fee > 0)
	if s.moneyDropFeeKobo > 0 {
		// Create temporary transaction record for fee collection
		tempFeeTx := &domain.Transaction{
			ID:              uuid.New(),
			SenderID:        userID,
			SourceAccountID: primaryAccount.ID,
			Type:            "money_drop_fee",
			Category:        "Money Drop",
			Status:          "pending",
			Amount:          0,
			Fee:             s.moneyDropFeeKobo,
			Description:     "Money Drop Creation Fee",
		}
		if err := s.collectTransactionFee(ctx, tempFeeTx, primaryAccount, s.moneyDropFeeKobo, "Money Drop Creation Fee"); err != nil {
			log.Printf("level=warn component=service flow=money_drop_create msg=\"money-drop creation fee collection failed\" user_id=%s err=%v", userID, err)
			// Don't fail the operation, just log the warning
		}
	}

	// 5. Create money drop record
	expiry := time.Now().Add(time.Duration(req.ExpiryInMinutes) * time.Minute)
	drop := &domain.MoneyDrop{
		CreatorID:              userID,
		Status:                 "active",
		AmountPerClaim:         req.AmountPerClaim,
		TotalClaimsAllowed:     req.NumberOfPeople,
		ClaimsMadeCount:        0,
		ExpiryTimestamp:        expiry,
		FundingSourceAccountID: primaryAccount.ID,
		MoneyDropAccountID:     moneyDropAccount.ID,
	}

	createdDrop, err := s.repo.CreateMoneyDrop(ctx, drop)
	if err != nil {
		// Refund the Book Transfer since drop creation failed
		// Transfer back from money drop account to primary account
		refundReason := fmt.Sprintf("Money Drop Creation Failed - Refund")
		if _, refundErr := s.anchorClient.InitiateBookTransfer(ctx, moneyDropAccount.AnchorAccountID, primaryAccount.AnchorAccountID, refundReason, totalAmount); refundErr != nil {
			log.Printf("level=error component=service flow=money_drop_create msg=\"anchor funding refund failed after record creation error\" user_id=%s err=%v", userID, refundErr)
			// Also try to credit the database balance (including fee)
			if dbRefundErr := s.repo.CreditWallet(ctx, userID, requiredAmount); dbRefundErr != nil {
				log.Printf("level=error component=service flow=money_drop_create msg=\"wallet refund failed after record creation error\" user_id=%s err=%v", userID, dbRefundErr)
			}
		} else {
			// If Anchor transfer refund succeeded but drop creation failed, also refund the fee
			if s.moneyDropFeeKobo > 0 {
				// Try to refund fee from admin account back to user (if fee was collected)
				log.Printf("level=warn component=service flow=money_drop_create msg=\"drop creation failed after fee collection; manual fee refund may be required\" user_id=%s", userID)
			}
		}
		return nil, fmt.Errorf("failed to create money drop record: %w", err)
	}

	// 6. Log the funding transaction
	fundingTx := &domain.Transaction{
		ID:                   uuid.New(),
		SenderID:             userID,
		SourceAccountID:      primaryAccount.ID,
		DestinationAccountID: &moneyDropAccount.ID,
		Type:                 "money_drop_funding",
		Category:             "Money Drop",
		Status:               "completed",
		Amount:               totalAmount,
		Fee:                  s.moneyDropFeeKobo, // Record fee in database
		Description:          fmt.Sprintf("Funding for Money Drop #%s", createdDrop.ID.String()),
	}
	if err := s.repo.CreateTransaction(ctx, fundingTx); err != nil {
		log.Printf("level=warn component=service flow=money_drop_create msg=\"failed to persist funding transaction log\" user_id=%s err=%v", userID, err)
		// Don't fail the operation, the drop is already created
	}

	// 7. Prepare and return response
	dropIDStr := createdDrop.ID.String()
	response := &domain.CreateMoneyDropResponse{
		MoneyDropID:     dropIDStr,
		QRCodeContent:   fmt.Sprintf("transfa://claim-drop/%s", dropIDStr),
		ShareableLink:   fmt.Sprintf("https://transfa.app/claim?drop_id=%s", dropIDStr),
		TotalAmount:     totalAmount,
		AmountPerClaim:  req.AmountPerClaim,
		NumberOfPeople:  req.NumberOfPeople,
		Fee:             s.moneyDropFeeKobo, // Include fee in response
		ExpiryTimestamp: expiry,
	}

	log.Printf("level=info component=service flow=money_drop_create msg=\"money drop created\" money_drop_id=%s user_id=%s", dropIDStr, userID)
	return response, nil
}

// ClaimMoneyDrop orchestrates claiming a portion of a money drop.
func (s *Service) ClaimMoneyDrop(ctx context.Context, claimantID uuid.UUID, dropID uuid.UUID) (*domain.ClaimMoneyDropResponse, error) {
	log.Printf("level=info component=service flow=money_drop_claim msg=\"claim requested\" money_drop_id=%s claimant_id=%s", dropID, claimantID)

	// 1. Get drop details
	drop, err := s.repo.FindMoneyDropByID(ctx, dropID)
	if err != nil {
		return nil, fmt.Errorf("invalid money drop ID: %w", err)
	}

	if drop.CreatorID == claimantID {
		return nil, errors.New("you cannot claim your own money drop")
	}

	// 2. Get claimant's account
	claimantAccount, err := s.repo.FindAccountByUserID(ctx, claimantID)
	if err != nil {
		return nil, fmt.Errorf("could not find claimant's primary account: %w", err)
	}

	// 3. Get money drop account
	moneyDropAccount, err := s.repo.FindMoneyDropAccountByUserID(ctx, drop.CreatorID)
	if err != nil {
		return nil, fmt.Errorf("could not find money drop account: %w", err)
	}

	// 4. Perform atomic claim in database
	err = s.repo.ClaimMoneyDropAtomic(ctx, dropID, claimantID, claimantAccount.ID, moneyDropAccount.ID, drop.AmountPerClaim)
	if err != nil {
		return nil, fmt.Errorf("failed to process claim: %w", err)
	}

	// 5. Get creator details for response
	creator, err := s.repo.FindMoneyDropCreatorByDropID(ctx, dropID)
	if err != nil {
		return nil, fmt.Errorf("could not find creator's user record: %w", err)
	}

	// 6. Verify money drop account has Anchor account ID
	if moneyDropAccount.AnchorAccountID == "" {
		return nil, fmt.Errorf("money drop account does not have an Anchor account ID")
	}

	// 7. Initiate BookTransfer from money drop account to claimant's account
	reason := fmt.Sprintf("Money Drop Claim by %s", creator.Username)

	_, err = s.anchorClient.InitiateBookTransfer(ctx, moneyDropAccount.AnchorAccountID, claimantAccount.AnchorAccountID, reason, drop.AmountPerClaim)
	if err != nil {
		log.Printf("level=error component=service flow=money_drop_claim msg=\"anchor transfer initiation failed\" money_drop_id=%s claimant_id=%s err=%v", dropID, claimantID, err)
		// Note: The claim has already been recorded in the database.
		// In a production system, you might want to implement retry logic or a compensation transaction.
		// For now, we return success but log the error.
		// The transaction status will be updated by the webhook handler.
	} else {
		log.Printf("level=info component=service flow=money_drop_claim msg=\"anchor transfer created\" money_drop_id=%s claimant_id=%s amount=%d", dropID, claimantID, drop.AmountPerClaim)
	}

	// 7.5. Sync money drop account balance after claim
	if err := s.syncMoneyDropAccountBalance(ctx, moneyDropAccount.ID, moneyDropAccount.AnchorAccountID); err != nil {
		log.Printf("level=warn component=service flow=money_drop_claim msg=\"money-drop account sync failed after claim\" account_id=%s err=%v", moneyDropAccount.ID, err)
		// Don't fail the operation, balance will sync later
	}

	// 7.6. Sync claimant's account balance after receiving funds
	if err := s.syncAccountBalance(ctx, claimantID); err != nil {
		log.Printf("level=warn component=service flow=money_drop_claim msg=\"claimant balance sync failed\" claimant_id=%s err=%v", claimantID, err)
		// Don't fail the operation, balance will sync later
	}

	// 8. Prepare and return response
	response := &domain.ClaimMoneyDropResponse{
		Message:         "Money drop claimed successfully!",
		AmountClaimed:   drop.AmountPerClaim,
		CreatorUsername: creator.Username,
	}

	log.Printf("level=info component=service flow=money_drop_claim msg=\"claim completed\" money_drop_id=%s claimant_id=%s", dropID, claimantID)
	return response, nil
}

// GetMoneyDropDetails retrieves details about a money drop for display.
func (s *Service) GetMoneyDropDetails(ctx context.Context, dropID uuid.UUID) (*domain.MoneyDropDetails, error) {
	drop, err := s.repo.FindMoneyDropByID(ctx, dropID)
	if err != nil {
		return nil, fmt.Errorf("money drop not found: %w", err)
	}

	creator, err := s.repo.FindMoneyDropCreatorByDropID(ctx, dropID)
	if err != nil {
		return nil, fmt.Errorf("could not find creator: %w", err)
	}

	details := &domain.MoneyDropDetails{
		ID:              drop.ID,
		CreatorUsername: creator.Username,
		AmountPerClaim:  drop.AmountPerClaim,
		Status:          drop.Status,
		IsClaimable:     false,
		Message:         "",
	}

	// Determine if drop is claimable
	if drop.Status != "active" {
		details.Message = "This money drop is no longer active."
		details.IsClaimable = false
	} else if time.Now().After(drop.ExpiryTimestamp) {
		details.Message = "This money drop has expired."
		details.IsClaimable = false
	} else if drop.ClaimsMadeCount >= drop.TotalClaimsAllowed {
		details.Message = "This money drop has been fully claimed."
		details.IsClaimable = false
	} else {
		details.Message = "You can claim this money drop!"
		details.IsClaimable = true
	}

	return details, nil
}

// RefundMoneyDrop processes a refund for an expired or completed money drop.
func (s *Service) RefundMoneyDrop(ctx context.Context, dropID uuid.UUID, creatorID uuid.UUID, amount int64) error {
	log.Printf("level=info component=service flow=money_drop_refund msg=\"refund requested\" money_drop_id=%s creator_id=%s amount=%d", dropID, creatorID, amount)

	// Get creator's primary account
	creatorAccount, err := s.repo.FindAccountByUserID(ctx, creatorID)
	if err != nil {
		return fmt.Errorf("failed to get creator's account: %w", err)
	}

	// Get money drop account
	moneyDropAccount, err := s.repo.FindMoneyDropAccountByUserID(ctx, creatorID)
	if err != nil {
		return fmt.Errorf("failed to get money drop account: %w", err)
	}

	// Verify money drop account has Anchor account ID
	if moneyDropAccount.AnchorAccountID == "" {
		return fmt.Errorf("money drop account does not have an Anchor account ID")
	}

	// Transfer funds from money drop account back to primary account via Book Transfer
	reason := fmt.Sprintf("Money Drop Refund - Amount: %d kobo", amount)
	_, err = s.anchorClient.InitiateBookTransfer(ctx, moneyDropAccount.AnchorAccountID, creatorAccount.AnchorAccountID, reason, amount)
	if err != nil {
		return fmt.Errorf("failed to transfer funds back to primary account: %w", err)
	}
	log.Printf("level=info component=service flow=money_drop_refund msg=\"anchor transfer created\" money_drop_id=%s creator_id=%s amount=%d", dropID, creatorID, amount)

	// Update database balances (credit primary)
	if err := s.repo.CreditWallet(ctx, creatorID, amount); err != nil {
		log.Printf("level=warn component=service flow=money_drop_refund msg=\"wallet credit failed\" creator_id=%s err=%v", creatorID, err)
		// Don't fail - Anchor transfer succeeded, balance will sync later
	}

	// Sync money drop account balance after refund
	if err := s.syncMoneyDropAccountBalance(ctx, moneyDropAccount.ID, moneyDropAccount.AnchorAccountID); err != nil {
		log.Printf("level=warn component=service flow=money_drop_refund msg=\"money-drop account sync failed after refund\" account_id=%s err=%v", moneyDropAccount.ID, err)
		// Don't fail the operation, balance will sync later
	}

	// Sync creator's primary account balance after refund
	if err := s.syncAccountBalance(ctx, creatorID); err != nil {
		log.Printf("level=warn component=service flow=money_drop_refund msg=\"creator balance sync failed after refund\" creator_id=%s err=%v", creatorID, err)
		// Don't fail the operation, balance will sync later
	}

	// Log the refund transaction
	refundTx := &domain.Transaction{
		ID:                   uuid.New(),
		SenderID:             creatorID,
		SourceAccountID:      moneyDropAccount.ID,
		DestinationAccountID: &creatorAccount.ID,
		Type:                 "money_drop_refund",
		Category:             "Money Drop",
		Status:               "completed",
		Amount:               amount,
		Fee:                  0,
		Description:          fmt.Sprintf("Refund for Money Drop #%s", dropID.String()),
	}
	if err := s.repo.CreateTransaction(ctx, refundTx); err != nil {
		log.Printf("level=warn component=service flow=money_drop_refund msg=\"failed to persist refund transaction log\" creator_id=%s err=%v", creatorID, err)
	}

	log.Printf("level=info component=service flow=money_drop_refund msg=\"refund completed\" money_drop_id=%s creator_id=%s", dropID, creatorID)
	return nil
}
