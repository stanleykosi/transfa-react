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
	"strings"
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
	defaultTransactionFee           = 500
	pinMaxAttempts                  = 5
	pinLockoutSeconds               = 900
	maxBulkP2PTransfers             = 10
	maxPaymentRequestTitleLen       = 80
	maxPaymentRequestDescriptionLen = 500
	maxPaymentRequestDeclineLen     = 240
)

type serviceContextKey string

const skipAnchorBalanceCheckCtxKey serviceContextKey = "skip_anchor_balance_check"

var (
	ErrInvalidTransactionPIN            = errors.New("invalid transaction pin")
	ErrTransactionPINLocked             = errors.New("transaction pin temporarily locked")
	ErrInvalidTransferAmount            = errors.New("transfer amount must be greater than zero")
	ErrInvalidDescription               = errors.New("description must be between 3 and 100 characters")
	ErrInvalidRecipient                 = errors.New("recipient username is required")
	ErrSelfTransferNotAllowed           = errors.New("self transfer is not allowed on p2p endpoint")
	ErrBulkTransferEmpty                = errors.New("at least one transfer item is required")
	ErrBulkTransferLimit                = errors.New("bulk transfer supports a maximum of 10 recipients")
	ErrDuplicateRecipient               = errors.New("duplicate recipient in bulk transfer request")
	ErrInvalidPaymentRequestType        = errors.New("request type must be general or individual")
	ErrInvalidPaymentRequestTitle       = errors.New("request title must be between 3 and 80 characters")
	ErrInvalidPaymentRequestDescription = errors.New("request description cannot exceed 500 characters")
	ErrInvalidPaymentRequestRecipient   = errors.New("recipient username is required for individual request")
	ErrSelfPaymentRequest               = errors.New("cannot create an individual request for yourself")
	ErrPaymentRequestNotFound           = errors.New("payment request not found")
	ErrPaymentRequestNotPending         = errors.New("payment request is not pending")
	ErrInvalidPaymentRequestDecline     = errors.New("decline reason cannot exceed 240 characters")
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
	req.RecipientUsername = strings.TrimSpace(req.RecipientUsername)
	req.Description = strings.TrimSpace(req.Description)
	if req.RecipientUsername == "" {
		return nil, ErrInvalidRecipient
	}
	if req.Amount <= 0 {
		return nil, ErrInvalidTransferAmount
	}
	if !isValidTransferDescription(req.Description) {
		return nil, ErrInvalidDescription
	}

	// 1. Get sender and recipient details
	sender, err := s.repo.FindUserByID(ctx, senderID)
	if err != nil {
		return nil, fmt.Errorf("failed to find sender: %w", err)
	}

	recipient, err := s.repo.FindUserByUsername(ctx, req.RecipientUsername)
	if err != nil {
		return nil, fmt.Errorf("failed to find recipient: %w", err)
	}
	if recipient.ID == sender.ID {
		return nil, ErrSelfTransferNotAllowed
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

	if !shouldSkipAnchorBalanceCheck(ctx) {
		// Sync the internal database balance with Anchor before validation.
		if err := s.syncAccountBalance(ctx, sender.ID); err != nil {
			log.Printf("level=warn component=service flow=p2p_transfer msg=\"balance sync failed\" sender_id=%s err=%v", sender.ID, err)
			// Continue with validation even if sync fails, but log the warning.
		}

		// Get the actual balance from Anchor API for validation.
		anchorBalance, err := s.anchorClient.GetAccountBalance(ctx, senderAccount.AnchorAccountID)
		if err != nil {
			return nil, fmt.Errorf("failed to get account balance from Anchor: %w", err)
		}

		availableBalance := anchorBalance.Data.AvailableBalance
		requiredAmount := req.Amount + s.transactionFeeKobo
		if availableBalance < requiredAmount {
			return nil, store.ErrInsufficientFunds
		}
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
		if s.eventProducer != nil {
			_ = s.eventProducer.Publish(ctx, "transfa.events", "transfer.fee.collection.failed", map[string]interface{}{
				"transaction_id": txRecord.ID.String(),
				"sender_id":      sender.ID.String(),
				"amount":         s.transactionFeeKobo,
				"category":       "p2p_transfer_fee",
				"error":          err.Error(),
				"occurred_at":    time.Now().UTC(),
			})
		}
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

// ProcessBulkP2PTransfer processes up to 10 P2P transfers in one authenticated request.
// It performs shared pre-validation and best-effort execution per item so one recipient
// failure does not block other valid recipients.
func (s *Service) ProcessBulkP2PTransfer(ctx context.Context, senderID uuid.UUID, items []domain.BulkP2PTransferItem) (*domain.BulkP2PTransferResult, error) {
	startedAt := time.Now()

	if len(items) == 0 {
		return nil, ErrBulkTransferEmpty
	}
	if len(items) > maxBulkP2PTransfers {
		return nil, ErrBulkTransferLimit
	}

	sender, err := s.repo.FindUserByID(ctx, senderID)
	if err != nil {
		return nil, fmt.Errorf("failed to find sender: %w", err)
	}
	if !sender.AllowSending {
		return nil, errors.New("sender account is not permitted to send funds")
	}

	senderAccount, err := s.repo.FindAccountByUserID(ctx, senderID)
	if err != nil {
		return nil, fmt.Errorf("failed to find sender account: %w", err)
	}

	requests := make([]domain.P2PTransferRequest, 0, len(items))
	batchItems := make([]domain.TransferBatchItem, 0, len(items))
	seenRecipients := make(map[string]struct{}, len(items))
	var estimatedTotalDebit int64

	for _, item := range items {
		recipient := strings.TrimSpace(item.RecipientUsername)
		description := strings.TrimSpace(item.Description)
		if recipient == "" {
			return nil, ErrInvalidRecipient
		}
		if item.Amount <= 0 {
			return nil, ErrInvalidTransferAmount
		}
		if !isValidTransferDescription(description) {
			return nil, ErrInvalidDescription
		}

		normalized := strings.ToLower(recipient)
		if _, exists := seenRecipients[normalized]; exists {
			return nil, ErrDuplicateRecipient
		}
		seenRecipients[normalized] = struct{}{}

		estimatedTotalDebit += item.Amount + s.transactionFeeKobo
		requests = append(requests, domain.P2PTransferRequest{
			RecipientUsername: recipient,
			Amount:            item.Amount,
			Description:       description,
		})
		batchItems = append(batchItems, domain.TransferBatchItem{
			ID:                uuid.New(),
			RecipientUsername: recipient,
			Amount:            item.Amount,
			Description:       description,
			Status:            "pending",
		})
	}

	// Soft pre-check: if balance is clearly insufficient for full batch, reject early.
	if err := s.syncAccountBalance(ctx, senderID); err != nil {
		log.Printf("level=warn component=service flow=bulk_p2p_transfer msg=\"balance sync failed\" sender_id=%s err=%v", senderID, err)
	}
	anchorBalance, err := s.anchorClient.GetAccountBalance(ctx, senderAccount.AnchorAccountID)
	if err != nil {
		return nil, fmt.Errorf("failed to get account balance from Anchor: %w", err)
	}
	if anchorBalance.Data.AvailableBalance < estimatedTotalDebit {
		return nil, store.ErrInsufficientFunds
	}

	batch := &domain.TransferBatch{
		ID:             uuid.New(),
		SenderID:       senderID,
		Status:         "processing",
		RequestedCount: len(requests),
	}
	for i := range batchItems {
		batchItems[i].BatchID = batch.ID
	}
	if err := s.repo.CreateTransferBatchWithItems(ctx, batch, batchItems); err != nil {
		return nil, fmt.Errorf("failed to create transfer batch and items: %w", err)
	}

	result := &domain.BulkP2PTransferResult{
		BatchID:    batch.ID,
		Successful: make([]*domain.Transaction, 0, len(requests)),
		Failed:     make([]domain.BulkP2PTransferFailure, 0),
	}

	batchCtx := context.WithValue(ctx, skipAnchorBalanceCheckCtxKey, true)

	for idx, req := range requests {
		item := batchItems[idx]
		tx, transferErr := s.ProcessP2PTransfer(batchCtx, senderID, req)
		if transferErr != nil {
			if err := s.markBatchItemFailedWithRetry(ctx, item.ID, mapTransferError(transferErr)); err != nil {
				log.Printf("level=error component=service flow=bulk_p2p_transfer msg=\"failed to persist failed batch item\" batch_id=%s item_id=%s err=%v", batch.ID, item.ID, err)
			}
			result.Failed = append(result.Failed, domain.BulkP2PTransferFailure{
				RecipientUsername: req.RecipientUsername,
				Amount:            req.Amount,
				Description:       req.Description,
				Error:             mapTransferError(transferErr),
			})
			continue
		}

		if err := s.markBatchItemCompletedWithRetry(ctx, item.ID, tx.ID, tx.Fee); err != nil {
			log.Printf("level=error component=service flow=bulk_p2p_transfer msg=\"failed to persist completed batch item\" batch_id=%s item_id=%s transaction_id=%s err=%v", batch.ID, item.ID, tx.ID, err)
		}
		result.Successful = append(result.Successful, tx)
	}

	if finalized, err := s.repo.FinalizeTransferBatch(ctx, batch.ID); err != nil {
		log.Printf("level=error component=service flow=bulk_p2p_transfer msg=\"failed to finalize transfer batch\" batch_id=%s err=%v", batch.ID, err)
	} else {
		log.Printf(
			"level=info component=service flow=bulk_p2p_transfer msg=\"transfer batch finalized\" batch_id=%s status=%s success_count=%d failure_count=%d total_amount=%d total_fee=%d",
			finalized.ID,
			finalized.Status,
			finalized.SuccessCount,
			finalized.FailureCount,
			finalized.TotalAmount,
			finalized.TotalFee,
		)
	}

	log.Printf(
		"level=info component=service flow=bulk_p2p_transfer msg=\"bulk transfer processed\" sender_id=%s batch_id=%s total=%d successful=%d failed=%d duration_ms=%d",
		senderID,
		batch.ID,
		len(requests),
		len(result.Successful),
		len(result.Failed),
		time.Since(startedAt).Milliseconds(),
	)

	return result, nil
}

func isValidTransferDescription(description string) bool {
	length := len(strings.TrimSpace(description))
	return length >= 3 && length <= 100
}

func mapTransferError(err error) string {
	switch {
	case errors.Is(err, store.ErrInsufficientFunds):
		return "Insufficient funds"
	case errors.Is(err, store.ErrUserNotFound):
		return "Recipient user not found"
	case errors.Is(err, ErrInvalidTransferAmount):
		return ErrInvalidTransferAmount.Error()
	case errors.Is(err, ErrInvalidDescription):
		return ErrInvalidDescription.Error()
	case errors.Is(err, ErrInvalidRecipient):
		return ErrInvalidRecipient.Error()
	case errors.Is(err, ErrSelfTransferNotAllowed):
		return ErrSelfTransferNotAllowed.Error()
	default:
		return "Transfer failed"
	}
}

func shouldSkipAnchorBalanceCheck(ctx context.Context) bool {
	if ctx == nil {
		return false
	}

	value := ctx.Value(skipAnchorBalanceCheckCtxKey)
	flag, ok := value.(bool)
	return ok && flag
}

func (s *Service) markBatchItemCompletedWithRetry(ctx context.Context, itemID uuid.UUID, transactionID uuid.UUID, fee int64) error {
	const maxAttempts = 3
	var err error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		err = s.repo.MarkTransferBatchItemCompleted(ctx, itemID, transactionID, fee)
		if err == nil {
			return nil
		}
		if attempt < maxAttempts {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(100 * time.Millisecond):
			}
		}
	}
	return err
}

func (s *Service) markBatchItemFailedWithRetry(ctx context.Context, itemID uuid.UUID, reason string) error {
	const maxAttempts = 3
	var err error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		err = s.repo.MarkTransferBatchItemFailed(ctx, itemID, reason)
		if err == nil {
			return nil
		}
		if attempt < maxAttempts {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(100 * time.Millisecond):
			}
		}
	}
	return err
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
	req.Description = strings.TrimSpace(req.Description)
	if req.Amount <= 0 {
		return nil, ErrInvalidTransferAmount
	}
	if !isValidTransferDescription(req.Description) {
		return nil, ErrInvalidDescription
	}

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
		if s.eventProducer != nil {
			_ = s.eventProducer.Publish(ctx, "transfa.events", "transfer.fee.collection.failed", map[string]interface{}{
				"transaction_id": txRecord.ID.String(),
				"sender_id":      sender.ID.String(),
				"amount":         s.transactionFeeKobo,
				"category":       "self_transfer_fee",
				"error":          err.Error(),
				"occurred_at":    time.Now().UTC(),
			})
		}
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

// GetTransactionHistoryWithUser retrieves transactions between the authenticated user and one counterparty.
func (s *Service) GetTransactionHistoryWithUser(ctx context.Context, userID uuid.UUID, counterpartyUsername string, limit int, offset int) (*domain.User, []domain.Transaction, error) {
	normalized := strings.TrimSpace(counterpartyUsername)
	if normalized == "" {
		return nil, nil, ErrInvalidRecipient
	}

	counterparty, err := s.repo.FindUserByUsername(ctx, normalized)
	if err != nil {
		return nil, nil, err
	}
	if counterparty.ID == userID {
		return nil, nil, ErrSelfTransferNotAllowed
	}

	transactions, err := s.repo.FindTransactionsBetweenUsers(ctx, userID, counterparty.ID, limit, offset)
	if err != nil {
		return nil, nil, err
	}

	return counterparty, transactions, nil
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
	requestType := strings.ToLower(strings.TrimSpace(payload.RequestType))
	title := strings.TrimSpace(payload.Title)
	description := normalizeOptionalString(payload.Description)
	imageURL := normalizeOptionalString(payload.ImageURL)

	if requestType != "general" && requestType != "individual" {
		return nil, ErrInvalidPaymentRequestType
	}
	if len(title) < 3 || len(title) > maxPaymentRequestTitleLen {
		return nil, ErrInvalidPaymentRequestTitle
	}
	if description != nil && len(*description) > maxPaymentRequestDescriptionLen {
		return nil, ErrInvalidPaymentRequestDescription
	}
	if payload.Amount <= 0 {
		return nil, ErrInvalidTransferAmount
	}

	var recipientUserID *uuid.UUID
	var recipientUsername *string
	var recipientFullName *string

	if requestType == "individual" {
		if payload.RecipientUsername == nil || strings.TrimSpace(*payload.RecipientUsername) == "" {
			return nil, ErrInvalidPaymentRequestRecipient
		}

		recipientLookup := strings.ToLower(strings.TrimSpace(*payload.RecipientUsername))
		recipient, err := s.repo.FindUserByUsername(ctx, recipientLookup)
		if err != nil {
			return nil, err
		}
		if recipient.ID == creatorID {
			return nil, ErrSelfPaymentRequest
		}

		recipientUserID = &recipient.ID
		username := recipient.Username
		recipientUsername = &username
		if recipient.FullName != nil {
			fullName := strings.TrimSpace(*recipient.FullName)
			if fullName != "" {
				recipientFullName = &fullName
			}
		}
	}

	newRequest := &domain.PaymentRequest{
		ID:                uuid.New(),
		CreatorID:         creatorID,
		Status:            "pending", // Initial status is always pending.
		RequestType:       requestType,
		Title:             title,
		RecipientUserID:   recipientUserID,
		RecipientUsername: recipientUsername,
		RecipientFullName: recipientFullName,
		Amount:            payload.Amount,
		Description:       description,
		ImageURL:          imageURL,
	}

	// Persist the new request to the database via the repository.
	created, err := s.repo.CreatePaymentRequest(ctx, newRequest)
	if err != nil {
		return nil, err
	}
	decorated := s.decoratePaymentRequest(created)

	if requestType == "individual" && decorated.RecipientUserID != nil {
		creator, creatorErr := s.repo.FindUserByID(ctx, creatorID)
		if creatorErr != nil {
			log.Printf("level=warn component=service flow=payment_request msg=\"creator lookup failed for notification\" creator_id=%s err=%v", creatorID, creatorErr)
		} else {
			recipientID := *decorated.RecipientUserID
			body := fmt.Sprintf("%s sent you a payment request.", stripUsernamePrefix(creator.Username))
			dedupeKey := fmt.Sprintf("request.incoming:%s:%s", decorated.ID, recipientID)
			relatedEntityType := "payment_request"

			s.emitInAppNotification(ctx, "create_payment_request", domain.InAppNotification{
				ID:                uuid.New(),
				UserID:            recipientID,
				Category:          "request",
				Type:              "request.incoming",
				Title:             "Incoming Request",
				Body:              &body,
				Status:            "unread",
				RelatedEntityType: &relatedEntityType,
				RelatedEntityID:   &decorated.ID,
				DedupeKey:         &dedupeKey,
				Data: map[string]interface{}{
					"request_id":        decorated.ID.String(),
					"amount":            decorated.Amount,
					"request_type":      decorated.RequestType,
					"title":             decorated.Title,
					"description":       decorated.Description,
					"image_url":         decorated.ImageURL,
					"actor_user_id":     creator.ID.String(),
					"actor_username":    stripUsernamePrefix(creator.Username),
					"actor_full_name":   optionalTrimmedString(creator.FullName),
					"display_status":    "pending",
					"created_at":        decorated.CreatedAt.UTC().Format(time.RFC3339),
					"recipient_user_id": recipientID.String(),
				},
			})
		}
	}

	return decorated, nil
}

// ListPaymentRequests retrieves all payment requests for a given user.
func (s *Service) ListPaymentRequests(ctx context.Context, creatorID uuid.UUID, opts domain.PaymentRequestListOptions) ([]domain.PaymentRequest, error) {
	requests, err := s.repo.ListPaymentRequestsByCreator(ctx, creatorID, opts)
	if err != nil {
		return nil, err
	}
	for idx := range requests {
		s.decoratePaymentRequest(&requests[idx])
	}
	return requests, nil
}

// GetPaymentRequestByID retrieves a single payment request by its ID.
func (s *Service) GetPaymentRequestByID(ctx context.Context, requestID uuid.UUID, creatorID uuid.UUID) (*domain.PaymentRequest, error) {
	request, err := s.repo.GetPaymentRequestByID(ctx, requestID, creatorID)
	if err != nil || request == nil {
		return request, err
	}
	return s.decoratePaymentRequest(request), nil
}

// DeletePaymentRequest soft-deletes a payment request owned by creatorID.
func (s *Service) DeletePaymentRequest(ctx context.Context, requestID uuid.UUID, creatorID uuid.UUID) (bool, error) {
	return s.repo.DeletePaymentRequest(ctx, requestID, creatorID)
}

// ListIncomingPaymentRequests retrieves incoming request cards for a recipient.
func (s *Service) ListIncomingPaymentRequests(ctx context.Context, recipientID uuid.UUID, opts domain.PaymentRequestListOptions) ([]domain.PaymentRequest, error) {
	requests, err := s.repo.ListIncomingPaymentRequests(ctx, recipientID, opts)
	if err != nil {
		return nil, err
	}
	for idx := range requests {
		s.decoratePaymentRequest(&requests[idx])
	}
	return requests, nil
}

// GetIncomingPaymentRequestByID retrieves one incoming request detail by id.
func (s *Service) GetIncomingPaymentRequestByID(ctx context.Context, requestID uuid.UUID, recipientID uuid.UUID) (*domain.PaymentRequest, error) {
	request, err := s.repo.GetIncomingPaymentRequestByID(ctx, requestID, recipientID)
	if err != nil || request == nil {
		return request, err
	}
	return s.decoratePaymentRequest(request), nil
}

// PayIncomingPaymentRequest settles an incoming request by initiating a P2P transfer to the creator.
func (s *Service) PayIncomingPaymentRequest(ctx context.Context, requestID uuid.UUID, recipientID uuid.UUID) (*domain.PayIncomingPaymentRequestResult, error) {
	// Idempotency fast-path: return the already-settled request if client retries.
	settledResult, err := s.resolveSettledIncomingPaymentRequest(ctx, requestID, recipientID)
	if err != nil {
		return nil, err
	}
	if settledResult != nil {
		return settledResult, nil
	}

	// Reconciliation fast-path: recover processing requests that already initiated transfer.
	existing, err := s.repo.GetIncomingPaymentRequestByID(ctx, requestID, recipientID)
	if err != nil {
		return nil, err
	}
	if existing != nil && strings.ToLower(existing.Status) == "processing" {
		reconciledResult, reconcileErr := s.tryReconcileProcessingIncomingRequest(ctx, existing, recipientID)
		if reconcileErr != nil {
			return nil, reconcileErr
		}
		if reconciledResult != nil {
			return reconciledResult, nil
		}
	}

	request, err := s.repo.ClaimIncomingPaymentRequestForPayment(ctx, requestID, recipientID)
	if err != nil {
		if errors.Is(err, store.ErrPaymentRequestNotReady) {
			settledResult, settledErr := s.resolveSettledIncomingPaymentRequest(ctx, requestID, recipientID)
			if settledErr != nil {
				return nil, settledErr
			}
			if settledResult != nil {
				return settledResult, nil
			}

			existing, lookupErr := s.repo.GetIncomingPaymentRequestByID(ctx, requestID, recipientID)
			if lookupErr != nil {
				return nil, lookupErr
			}
			if existing == nil {
				return nil, ErrPaymentRequestNotFound
			}

			if strings.ToLower(existing.Status) == "processing" {
				reconciledResult, reconcileErr := s.tryReconcileProcessingIncomingRequest(ctx, existing, recipientID)
				if reconcileErr != nil {
					return nil, reconcileErr
				}
				if reconciledResult != nil {
					return reconciledResult, nil
				}
			}

			return nil, ErrPaymentRequestNotPending
		}
		return nil, err
	}

	creator, err := s.repo.FindUserByID(ctx, request.CreatorID)
	if err != nil {
		_ = s.repo.ReleasePaymentRequestFromProcessing(ctx, requestID, recipientID)
		if errors.Is(err, store.ErrUserNotFound) {
			return nil, ErrPaymentRequestNotFound
		}
		return nil, err
	}

	description := buildRequestSettlementDescription(request.Title)
	txRecord, err := s.ProcessP2PTransfer(ctx, recipientID, domain.P2PTransferRequest{
		RecipientUsername: creator.Username,
		Amount:            request.Amount,
		Description:       description,
	})
	if err != nil {
		_ = s.repo.ReleasePaymentRequestFromProcessing(ctx, requestID, recipientID)
		return nil, err
	}

	attachedRequest, err := s.repo.AttachProcessingPaymentRequestSettlementTransaction(ctx, requestID, recipientID, txRecord.ID)
	if err != nil {
		if errors.Is(err, store.ErrPaymentRequestNotReady) {
			settledResult, settledErr := s.resolveSettledIncomingPaymentRequest(ctx, requestID, recipientID)
			if settledErr != nil {
				return nil, settledErr
			}
			if settledResult != nil {
				return settledResult, nil
			}
		}
		log.Printf("level=warn component=service flow=payment_request_pay msg=\"failed to attach settlement transaction to processing request\" request_id=%s payer_id=%s tx_id=%s err=%v", requestID, recipientID, txRecord.ID, err)
		attachedRequest = request
	}

	return &domain.PayIncomingPaymentRequestResult{
		Request:     s.decoratePaymentRequest(attachedRequest),
		Transaction: txRecord,
	}, nil
}

func (s *Service) resolveSettledIncomingPaymentRequest(ctx context.Context, requestID uuid.UUID, recipientID uuid.UUID) (*domain.PayIncomingPaymentRequestResult, error) {
	request, err := s.repo.GetIncomingPaymentRequestByID(ctx, requestID, recipientID)
	if err != nil {
		return nil, err
	}
	if request == nil {
		return nil, nil
	}
	s.decoratePaymentRequest(request)

	status := strings.ToLower(strings.TrimSpace(request.Status))
	if status != "fulfilled" && status != "paid" {
		return nil, nil
	}
	if request.SettledTxID == nil {
		return nil, nil
	}

	txRecord, err := s.repo.FindTransactionByID(ctx, *request.SettledTxID)
	if err != nil {
		if errors.Is(err, store.ErrTransactionNotFound) {
			return nil, nil
		}
		return nil, err
	}

	return &domain.PayIncomingPaymentRequestResult{
		Request:     request,
		Transaction: txRecord,
	}, nil
}

func (s *Service) tryReconcileProcessingIncomingRequest(ctx context.Context, request *domain.PaymentRequest, recipientID uuid.UUID) (*domain.PayIncomingPaymentRequestResult, error) {
	if request == nil {
		return nil, nil
	}
	if strings.ToLower(strings.TrimSpace(request.Status)) != "processing" {
		return nil, nil
	}

	var txRecord *domain.Transaction
	if request.SettledTxID != nil {
		record, err := s.repo.FindTransactionByID(ctx, *request.SettledTxID)
		if err != nil && !errors.Is(err, store.ErrTransactionNotFound) {
			return nil, err
		}
		txRecord = record
	} else {
		since := request.CreatedAt
		if request.ProcessingStarted != nil && request.ProcessingStarted.After(since) {
			since = request.ProcessingStarted.Add(-30 * time.Second)
		}

		description := buildRequestSettlementDescription(request.Title)
		record, err := s.repo.FindLikelyPaymentRequestSettlementTransaction(
			ctx,
			recipientID,
			request.CreatorID,
			request.Amount,
			description,
			since,
		)
		if err != nil {
			return nil, err
		}
		txRecord = record
	}

	if txRecord == nil {
		return nil, nil
	}

	switch strings.ToLower(strings.TrimSpace(txRecord.Status)) {
	case "failed":
		if err := s.repo.ReleasePaymentRequestFromProcessingBySettlementTransaction(ctx, txRecord.ID); err != nil {
			return nil, err
		}
		return nil, nil
	case "completed":
		// Completed transfer can finalize the request.
	default:
		// Transfer still pending; keep request in processing state.
		return nil, nil
	}

	fulfilled, err := s.repo.MarkPaymentRequestFulfilled(ctx, request.ID, recipientID, txRecord.ID)
	if err != nil {
		if errors.Is(err, store.ErrPaymentRequestNotReady) {
			return s.resolveSettledIncomingPaymentRequest(ctx, request.ID, recipientID)
		}
		return nil, err
	}
	s.decoratePaymentRequest(fulfilled)
	s.publishRequestPaidNotification(ctx, fulfilled, recipientID, txRecord)

	return &domain.PayIncomingPaymentRequestResult{
		Request:     fulfilled,
		Transaction: txRecord,
	}, nil
}

func (s *Service) publishRequestPaidNotification(ctx context.Context, request *domain.PaymentRequest, payerID uuid.UUID, txRecord *domain.Transaction) {
	if request == nil || txRecord == nil {
		return
	}

	recipientLabel := request.RecipientUsername
	if recipientLabel == nil || strings.TrimSpace(*recipientLabel) == "" {
		payerUser, payerErr := s.repo.FindUserByID(ctx, payerID)
		if payerErr == nil {
			username := stripUsernamePrefix(payerUser.Username)
			recipientLabel = &username
		}
	}

	body := fmt.Sprintf("Your request \"%s\" has been paid.", request.Title)
	dedupeKey := fmt.Sprintf("request.paid:%s:%s", request.ID, txRecord.ID)
	relatedEntityType := "payment_request"

	if err := s.repo.CreateInAppNotification(ctx, domain.InAppNotification{
		ID:                uuid.New(),
		UserID:            request.CreatorID,
		Category:          "request",
		Type:              "request.paid",
		Title:             "Request Paid",
		Body:              &body,
		Status:            "unread",
		RelatedEntityType: &relatedEntityType,
		RelatedEntityID:   &request.ID,
		DedupeKey:         &dedupeKey,
		Data: map[string]interface{}{
			"request_id":        request.ID.String(),
			"transaction_id":    txRecord.ID.String(),
			"amount":            request.Amount,
			"status":            request.Status,
			"display_status":    request.DisplayStatus,
			"paid_by_user_id":   payerID.String(),
			"paid_by_username":  optionalStringValue(recipientLabel),
			"title":             request.Title,
			"description":       request.Description,
			"responded_at":      time.Now().UTC().Format(time.RFC3339),
			"recipient_user_id": optionalUUIDString(request.RecipientUserID),
		},
	}); err != nil {
		log.Printf("level=warn component=service flow=payment_request_pay msg=\"failed to emit request.paid notification\" request_id=%s payer_id=%s tx_id=%s err=%v", request.ID, payerID, txRecord.ID, err)
	}
}

// DeclineIncomingPaymentRequest declines one pending incoming request.
func (s *Service) DeclineIncomingPaymentRequest(ctx context.Context, requestID uuid.UUID, recipientID uuid.UUID, reason *string) (*domain.PaymentRequest, error) {
	normalizedReason := normalizeOptionalString(reason)
	if normalizedReason != nil && len(*normalizedReason) > maxPaymentRequestDeclineLen {
		return nil, ErrInvalidPaymentRequestDecline
	}

	request, err := s.repo.DeclineIncomingPaymentRequest(ctx, requestID, recipientID, normalizedReason)
	if err != nil {
		if errors.Is(err, store.ErrPaymentRequestNotReady) {
			existing, lookupErr := s.repo.GetIncomingPaymentRequestByID(ctx, requestID, recipientID)
			if lookupErr != nil {
				return nil, lookupErr
			}
			if existing == nil {
				return nil, ErrPaymentRequestNotFound
			}
			return nil, ErrPaymentRequestNotPending
		}
		return nil, err
	}
	s.decoratePaymentRequest(request)

	declinedBy := request.RecipientUsername
	if declinedBy == nil || strings.TrimSpace(*declinedBy) == "" {
		payerUser, payerErr := s.repo.FindUserByID(ctx, recipientID)
		if payerErr == nil {
			username := stripUsernamePrefix(payerUser.Username)
			declinedBy = &username
		}
	}

	body := fmt.Sprintf("Your request \"%s\" was declined.", request.Title)
	dedupeKey := fmt.Sprintf("request.declined:%s:%s", request.ID, recipientID)
	relatedEntityType := "payment_request"

	s.emitInAppNotification(ctx, "decline_payment_request", domain.InAppNotification{
		ID:                uuid.New(),
		UserID:            request.CreatorID,
		Category:          "request",
		Type:              "request.declined",
		Title:             "Request Declined",
		Body:              &body,
		Status:            "unread",
		RelatedEntityType: &relatedEntityType,
		RelatedEntityID:   &request.ID,
		DedupeKey:         &dedupeKey,
		Data: map[string]interface{}{
			"request_id":              request.ID.String(),
			"amount":                  request.Amount,
			"title":                   request.Title,
			"description":             request.Description,
			"declined_reason":         request.DeclinedReason,
			"declined_by_user_id":     recipientID.String(),
			"declined_by_username":    optionalStringValue(declinedBy),
			"display_status":          request.DisplayStatus,
			"status":                  request.Status,
			"recipient_user_id":       optionalUUIDString(request.RecipientUserID),
			"request_original_status": "pending",
		},
	})

	return request, nil
}

func (s *Service) ListInAppNotifications(ctx context.Context, userID uuid.UUID, opts domain.NotificationListOptions) ([]domain.InAppNotification, error) {
	return s.repo.ListInAppNotifications(ctx, userID, opts)
}

func (s *Service) MarkInAppNotificationRead(ctx context.Context, userID uuid.UUID, notificationID uuid.UUID) (bool, error) {
	return s.repo.MarkInAppNotificationRead(ctx, userID, notificationID)
}

func (s *Service) MarkAllInAppNotificationsRead(ctx context.Context, userID uuid.UUID, category *string) (int64, error) {
	return s.repo.MarkAllInAppNotificationsRead(ctx, userID, category)
}

func (s *Service) GetInAppNotificationUnreadCounts(ctx context.Context, userID uuid.UUID) (*domain.NotificationUnreadCounts, error) {
	return s.repo.GetInAppNotificationUnreadCounts(ctx, userID)
}

func (s *Service) emitInAppNotification(ctx context.Context, source string, item domain.InAppNotification) {
	if err := s.repo.CreateInAppNotification(ctx, item); err != nil {
		log.Printf(
			"level=warn component=service flow=notification_emit source=%s type=%s category=%s user_id=%s err=%v",
			source,
			item.Type,
			item.Category,
			item.UserID,
			err,
		)
	}
}

func (s *Service) decoratePaymentRequest(req *domain.PaymentRequest) *domain.PaymentRequest {
	if req == nil {
		return nil
	}

	switch strings.ToLower(req.Status) {
	case "fulfilled", "paid":
		req.DisplayStatus = "paid"
	case "declined":
		req.DisplayStatus = "declined"
	case "processing":
		req.DisplayStatus = "pending"
	default:
		req.DisplayStatus = "pending"
	}

	if req.ShareableLink == "" {
		req.ShareableLink = fmt.Sprintf("https://transfa.app/pay?request_id=%s", req.ID.String())
	}
	if req.QRCodeContent == "" {
		req.QRCodeContent = req.ShareableLink
	}

	return req
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func optionalTrimmedString(value *string) *string {
	return normalizeOptionalString(value)
}

func optionalStringValue(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func optionalUUIDString(value *uuid.UUID) string {
	if value == nil {
		return ""
	}
	return value.String()
}

func stripUsernamePrefix(username string) string {
	return strings.TrimLeft(strings.TrimSpace(username), "_")
}

func buildRequestSettlementDescription(title string) string {
	base := "Request payment"
	trimmed := strings.TrimSpace(title)
	if trimmed == "" {
		return base
	}

	candidate := fmt.Sprintf("Request payment: %s", trimmed)
	if len(candidate) <= 100 {
		return candidate
	}

	if len(base) >= 100 {
		return base[:100]
	}

	remaining := 100 - len(base) - 2
	if remaining <= 0 {
		return base
	}
	return fmt.Sprintf("%s: %s", base, trimmed[:remaining])
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

	// Perform the actual transfer from source account to admin account with one retry.
	const maxAttempts = 2
	var transferResp *anchorclient.TransferResponse
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		transferResp, err = s.anchorClient.InitiateBookTransfer(ctx, sourceAccount.AnchorAccountID, s.adminAccountID, description, amount)
		if err == nil {
			break
		}
		if attempt < maxAttempts {
			log.Printf("level=warn component=service flow=fee_collection msg=\"anchor fee transfer attempt failed; retrying\" attempt=%d err=%v", attempt, err)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(200 * time.Millisecond):
			}
		}
	}
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

	claimBody := fmt.Sprintf("You received %d kobo from a money drop.", drop.AmountPerClaim)
	claimEntityType := "money_drop"
	claimDedupe := fmt.Sprintf("money_drop.claim.received:%s:%s", dropID, claimantID)
	s.emitInAppNotification(ctx, "money_drop_claim", domain.InAppNotification{
		ID:                uuid.New(),
		UserID:            claimantID,
		Category:          "system",
		Type:              "money_drop.claim.received",
		Title:             "Money Drop Claimed",
		Body:              &claimBody,
		Status:            "unread",
		RelatedEntityType: &claimEntityType,
		RelatedEntityID:   &dropID,
		DedupeKey:         &claimDedupe,
		Data: map[string]interface{}{
			"drop_id":            dropID.String(),
			"amount":             drop.AmountPerClaim,
			"creator_user_id":    creator.ID.String(),
			"creator_username":   stripUsernamePrefix(creator.Username),
			"claimed_by_user_id": claimantID.String(),
		},
	})

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
