package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/transfa/transaction-service/internal/domain"
	"github.com/transfa/transaction-service/internal/store"
)

const maxMissingTransferRetries = 20

type TransferStatusConsumer struct {
	repo              store.Repository
	mu                sync.Mutex
	missingTxAttempts map[string]int
}

func NewTransferStatusConsumer(repo store.Repository) *TransferStatusConsumer {
	return &TransferStatusConsumer{
		repo:              repo,
		missingTxAttempts: make(map[string]int),
	}
}

func (c *TransferStatusConsumer) HandleMessage(body []byte) bool {
	var event domain.TransferStatusEvent
	if err := json.Unmarshal(body, &event); err != nil {
		log.Printf("level=warn component=transfer_consumer outcome=drop reason=invalid_payload err=%v", err)
		return true
	}

	if event.AnchorTransferID == "" {
		log.Printf("level=warn component=transfer_consumer outcome=drop reason=missing_anchor_transfer_id event_type=%s event_id=%s", event.EventType, event.EventID)
		return true
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := c.processEvent(ctx, event); err != nil {
		if errors.Is(err, store.ErrTransactionNotFound) {
			// Fee transfer webhooks are expected to not map to a primary user-facing transaction.
			if looksLikeFeeEvent(event) {
				log.Printf("level=info component=transfer_consumer outcome=ack reason=fee_event_without_transaction anchor_transfer_id=%s", event.AnchorTransferID)
				return true
			}

			attempt := c.incrementMissingAttempt(event.AnchorTransferID)
			if attempt < maxMissingTransferRetries {
				backoff := missingTransferRetryBackoff(attempt)
				if attempt == 1 || attempt == maxMissingTransferRetries-1 || attempt%5 == 0 {
					log.Printf("level=warn component=transfer_consumer outcome=retry reason=transaction_not_found anchor_transfer_id=%s attempt=%d max_attempts=%d backoff_ms=%d", event.AnchorTransferID, attempt, maxMissingTransferRetries, backoff.Milliseconds())
				}
				time.Sleep(backoff)
				return false
			}

			log.Printf("level=warn component=transfer_consumer outcome=ack reason=transaction_not_found anchor_transfer_id=%s attempts=%d", event.AnchorTransferID, attempt)
			c.clearMissingAttempt(event.AnchorTransferID)
			return true
		}

		log.Printf("level=error component=transfer_consumer outcome=requeue reason=processing_error anchor_transfer_id=%s err=%v", event.AnchorTransferID, err)
		return false
	}

	c.clearMissingAttempt(event.AnchorTransferID)
	return true
}

func (c *TransferStatusConsumer) processEvent(ctx context.Context, event domain.TransferStatusEvent) error {
	tx, err := c.findTransactionForEvent(ctx, event)
	if err != nil {
		return fmt.Errorf("lookup transaction: %w", err)
	}

	status := normalizeStatus(event.Status)
	transferType := normalizeTransferType(event.TransferType)

	// Completed money-drop claims are terminal. Ignore late/replayed failed events
	// before persisting metadata so we do not regress status back to failed.
	if tx.Type == "money_drop_claim" && status == "failed" && tx.Status == "completed" {
		log.Printf("level=info component=transfer_consumer msg=\"ignoring failed event for completed money-drop claim\" transaction_id=%s status=%s anchor_transfer_id=%s", tx.ID, tx.Status, event.AnchorTransferID)
		return nil
	}

	metadata := store.UpdateTransactionMetadataParams{
		Status:           optionalString(status),
		AnchorTransferID: optionalString(event.AnchorTransferID),
		TransferType:     optionalString(transferType),
		FailureReason:    optionalString(event.Reason),
		AnchorSessionID:  optionalString(event.SessionID),
		AnchorReason:     optionalString(event.Reason),
	}
	// money_drop_claim uses anchor_reason as a deterministic state token (`md_drop:<id>;state:<...>`).
	// Do not overwrite it with provider webhook free-text reasons.
	if tx.Type == "money_drop_claim" {
		metadata.AnchorReason = nil
	}

	if err := c.repo.UpdateTransactionMetadata(ctx, tx.ID, metadata); err != nil {
		return fmt.Errorf("update metadata: %w", err)
	}

	switch status {
	case "failed":
		return c.handleFailure(ctx, tx, event)
	case "completed":
		return c.handleSuccess(ctx, tx, event)
	default:
		return nil
	}
}

func (c *TransferStatusConsumer) findTransactionForEvent(ctx context.Context, event domain.TransferStatusEvent) (*domain.Transaction, error) {
	tx, err := c.repo.FindTransactionByAnchorTransferID(ctx, event.AnchorTransferID)
	if err == nil {
		return tx, nil
	}
	if !errors.Is(err, store.ErrTransactionNotFound) {
		return nil, err
	}

	if claimTxID, ok := extractMoneyDropClaimTransactionIDFromReason(event.Reason); ok {
		fallbackTx, fallbackErr := c.repo.FindTransactionByID(ctx, claimTxID)
		if fallbackErr != nil {
			if !errors.Is(fallbackErr, store.ErrTransactionNotFound) {
				return nil, fallbackErr
			}
		} else if isValidMoneyDropClaimReasonTokenTransaction(fallbackTx, event) {
			log.Printf("level=info component=transfer_consumer msg=\"resolved transaction via money-drop claim reason token\" transaction_id=%s anchor_transfer_id=%s", fallbackTx.ID, event.AnchorTransferID)
			return fallbackTx, nil
		}
	}

	fallbackTx, fallbackErr := c.repo.FindPendingMoneyDropClaimByAnchorParticipantsAndAmount(
		ctx,
		event.AnchorAccountID,
		event.CounterpartyID,
		event.Amount,
	)
	if fallbackErr != nil {
		if errors.Is(fallbackErr, store.ErrTransactionNotFound) {
			return nil, store.ErrTransactionNotFound
		}
		return nil, fallbackErr
	}
	if !isValidMoneyDropClaimParticipantFallbackTransaction(fallbackTx, event) {
		return nil, store.ErrTransactionNotFound
	}

	log.Printf("level=info component=transfer_consumer msg=\"resolved transaction via money-drop claim account-participant fallback\" transaction_id=%s anchor_transfer_id=%s", fallbackTx.ID, event.AnchorTransferID)
	return fallbackTx, nil
}

func isValidMoneyDropClaimReasonTokenTransaction(tx *domain.Transaction, event domain.TransferStatusEvent) bool {
	if !isValidMoneyDropClaimFallbackBase(tx, event) {
		return false
	}

	switch tx.Status {
	case "pending", "failed", "completed":
		return true
	default:
		return false
	}
}

func isValidMoneyDropClaimParticipantFallbackTransaction(tx *domain.Transaction, event domain.TransferStatusEvent) bool {
	if !isValidMoneyDropClaimFallbackBase(tx, event) {
		return false
	}
	return tx.Status == "pending"
}

func isValidMoneyDropClaimFallbackBase(tx *domain.Transaction, event domain.TransferStatusEvent) bool {
	if tx == nil {
		return false
	}
	if tx.Type != "money_drop_claim" {
		return false
	}
	if tx.AnchorTransferID != nil && strings.TrimSpace(*tx.AnchorTransferID) != "" {
		return false
	}
	if event.Amount > 0 && tx.Amount != event.Amount {
		return false
	}
	return true
}

func (c *TransferStatusConsumer) handleFailure(ctx context.Context, tx *domain.Transaction, event domain.TransferStatusEvent) error {
	if tx.Type == "money_drop_claim" {
		// Completed claims are terminal and must never be compensated.
		if tx.Status == "completed" {
			log.Printf("level=info component=transfer_consumer msg=\"ignoring failed event for completed money-drop claim\" transaction_id=%s status=%s anchor_transfer_id=%s", tx.ID, tx.Status, event.AnchorTransferID)
			return nil
		}
		return c.handleMoneyDropClaimFailure(ctx, tx, event)
	}

	if tx.Status == "failed" {
		return nil
	}

	if err := c.repo.MarkTransactionAsFailed(ctx, tx.ID, event.AnchorTransferID, event.Reason); err != nil {
		return fmt.Errorf("mark failed: %w", err)
	}

	if err := c.repo.CreditWallet(ctx, tx.SenderID, tx.Amount+tx.Fee); err != nil {
		return fmt.Errorf("refund wallet: %w", err)
	}

	if err := c.repo.RefundTransactionFee(ctx, tx.ID, tx.SenderID, tx.Fee); err != nil {
		log.Printf("level=warn component=transfer_consumer msg=\"fee refund failed\" transaction_id=%s err=%v", tx.ID, err)
	}

	if err := c.repo.ReleasePaymentRequestFromProcessingBySettlementTransaction(ctx, tx.ID); err != nil {
		return fmt.Errorf("release processing payment request: %w", err)
	}

	body := "A transfer failed and your wallet was refunded."
	relatedEntityType := "transaction"
	dedupeKey := fmt.Sprintf("transfer.failed:%s", tx.ID)
	relatedID := tx.ID
	c.emitInAppNotification(ctx, "transfer.failed", domain.InAppNotification{
		ID:                uuid.New(),
		UserID:            tx.SenderID,
		Category:          "system",
		Type:              "transfer.failed",
		Title:             "Transfer Failed",
		Body:              &body,
		Status:            "unread",
		RelatedEntityType: &relatedEntityType,
		RelatedEntityID:   &relatedID,
		DedupeKey:         &dedupeKey,
		Data: map[string]interface{}{
			"transaction_id": tx.ID.String(),
			"amount":         tx.Amount,
			"fee":            tx.Fee,
			"reason":         event.Reason,
			"status":         "failed",
		},
	})

	return nil
}

func (c *TransferStatusConsumer) handleMoneyDropClaimFailure(ctx context.Context, tx *domain.Transaction, event domain.TransferStatusEvent) error {
	dropID, hasDropID := extractMoneyDropDropIDFromAnchorReason(tx.AnchorReason)
	if !hasDropID {
		resolvedDropID, err := c.repo.FindMoneyDropClaimDropIDByTransactionID(ctx, tx.ID)
		if err != nil {
			if isRetryableMoneyDropClaimCompensationError(err) {
				return fmt.Errorf("resolve money-drop claim drop id: %w", err)
			}
			log.Printf("level=warn component=transfer_consumer msg=\"unable to resolve drop id for failed money-drop claim; using generic retry marker\" transaction_id=%s err=%v", tx.ID, err)
		} else {
			dropID = resolvedDropID
			hasDropID = true
		}
	}

	retryReason := buildGenericMoneyDropClaimAnchorReason(moneyDropClaimStateRetryRequested)
	if hasDropID {
		retryReason = buildMoneyDropClaimAnchorReason(dropID, moneyDropClaimStateRetryRequested)
	}
	failureReason := strings.TrimSpace(event.Reason)

	markedForRetry, err := c.repo.MarkMoneyDropClaimReconcileRequested(ctx, tx.ID, retryReason, failureReason)
	if err != nil {
		if isRetryableMoneyDropClaimCompensationError(err) {
			return fmt.Errorf("mark money-drop claim retry-requested: %w", err)
		}
		return c.markMoneyDropClaimAsFailedWithoutRevert(ctx, tx, event, fmt.Sprintf("failed to mark claim for reconciliation retry: %v", err))
	}
	if !markedForRetry {
		log.Printf("level=info component=transfer_consumer msg=\"skip failed money-drop claim retry mark; transaction no longer eligible\" transaction_id=%s anchor_transfer_id=%s", tx.ID, event.AnchorTransferID)
		return nil
	}

	log.Printf(
		"level=warn component=transfer_consumer msg=\"failed money-drop claim marked for reconciliation retry\" transaction_id=%s anchor_transfer_id=%s anchor_reason=%q",
		tx.ID,
		event.AnchorTransferID,
		retryReason,
	)
	return nil
}

func (c *TransferStatusConsumer) markMoneyDropClaimAsFailedWithoutRevert(ctx context.Context, tx *domain.Transaction, event domain.TransferStatusEvent, detail string) error {
	combinedReason := strings.TrimSpace(event.Reason)
	if combinedReason == "" {
		combinedReason = "money_drop_claim_failed"
	}
	combinedReason = fmt.Sprintf("%s; %s", combinedReason, detail)

	if err := c.repo.MarkTransactionAsFailed(ctx, tx.ID, event.AnchorTransferID, combinedReason); err != nil {
		return fmt.Errorf("mark failed money_drop_claim: %w", err)
	}

	log.Printf("level=error component=transfer_consumer msg=\"money-drop claim transfer failed without claim revert; manual intervention required\" transaction_id=%s anchor_transfer_id=%s detail=%q", tx.ID, event.AnchorTransferID, detail)
	return nil
}

func isRetryableMoneyDropClaimCompensationError(err error) bool {
	if err == nil {
		return false
	}

	if errors.Is(err, store.ErrMoneyDropNotFound) || errors.Is(err, store.ErrTransactionNotFound) {
		return false
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return true
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		code := strings.TrimSpace(pgErr.Code)
		if strings.HasPrefix(code, "08") || strings.HasPrefix(code, "40") || strings.HasPrefix(code, "53") || code == "55P03" || code == "57014" {
			return true
		}
		if strings.HasPrefix(code, "22") || strings.HasPrefix(code, "23") || strings.HasPrefix(code, "42") {
			return false
		}
	}

	return false
}

func (c *TransferStatusConsumer) handleSuccess(ctx context.Context, tx *domain.Transaction, event domain.TransferStatusEvent) error {
	if tx.Status == "completed" {
		return nil
	}
	if err := c.repo.MarkTransactionAsCompleted(ctx, tx.ID, event.AnchorTransferID); err != nil {
		return err
	}

	settledRequest, err := c.repo.MarkPaymentRequestFulfilledBySettlementTransaction(ctx, tx.ID)
	if err != nil {
		return fmt.Errorf("finalize processing payment request: %w", err)
	}

	if tx.RecipientID == nil {
		body := "Your transfer completed successfully."
		title := "Transfer Completed"
		if tx.Type == "self_transfer" {
			body = "Your withdrawal was completed successfully."
			title = "Withdrawal Completed"
		}

		relatedEntityType := "transaction"
		dedupeKey := fmt.Sprintf("transfer.completed:%s", tx.ID)
		relatedID := tx.ID
		c.emitInAppNotification(ctx, "transfer.completed", domain.InAppNotification{
			ID:                uuid.New(),
			UserID:            tx.SenderID,
			Category:          "system",
			Type:              "transfer.completed",
			Title:             title,
			Body:              &body,
			Status:            "unread",
			RelatedEntityType: &relatedEntityType,
			RelatedEntityID:   &relatedID,
			DedupeKey:         &dedupeKey,
			Data: map[string]interface{}{
				"transaction_id":   tx.ID.String(),
				"amount":           tx.Amount,
				"fee":              tx.Fee,
				"description":      tx.Description,
				"anchor_transfer":  event.AnchorTransferID,
				"transfer_type":    tx.TransferType,
				"transaction_type": tx.Type,
				"status":           "completed",
			},
		})
		return nil
	}

	sender, err := c.repo.FindUserByID(ctx, tx.SenderID)
	if err != nil {
		log.Printf("level=warn component=transfer_consumer msg=\"sender lookup failed for notification\" sender_id=%s err=%v", tx.SenderID, err)
	}

	senderUsername := ""
	if sender != nil {
		senderUsername = strings.TrimSpace(sender.Username)
	}

	if settledRequest != nil {
		c.emitRequestPaidNotification(ctx, settledRequest, tx, senderUsername)
	}

	body := "You received a transfer."
	if senderUsername != "" {
		body = fmt.Sprintf("You received a transfer from %s.", senderUsername)
	}

	relatedEntityType := "transaction"
	dedupeKey := fmt.Sprintf("transfer.received:%s", tx.ID)
	relatedID := tx.ID
	c.emitInAppNotification(ctx, "transfer.received", domain.InAppNotification{
		ID:                uuid.New(),
		UserID:            *tx.RecipientID,
		Category:          "system",
		Type:              "transfer.received",
		Title:             "Incoming Transfer",
		Body:              &body,
		Status:            "unread",
		RelatedEntityType: &relatedEntityType,
		RelatedEntityID:   &relatedID,
		DedupeKey:         &dedupeKey,
		Data: map[string]interface{}{
			"transaction_id":   tx.ID.String(),
			"amount":           tx.Amount,
			"fee":              tx.Fee,
			"description":      tx.Description,
			"sender_user_id":   tx.SenderID.String(),
			"sender_username":  senderUsername,
			"anchor_transfer":  event.AnchorTransferID,
			"transfer_type":    tx.TransferType,
			"transaction_type": tx.Type,
			"status":           "completed",
		},
	})

	return nil
}

func normalizeStatus(status string) string {
	status = strings.TrimSpace(strings.ToLower(status))
	switch status {
	case "successful", "success":
		return "completed"
	case "failed", "failure", "reversed":
		return "failed"
	case "initiated", "processing", "pending", "in_progress":
		return "pending"
	default:
		// Unknown statuses should not be written into the enum-backed DB column.
		return ""
	}
}

func normalizeTransferType(typ string) string {
	typ = strings.TrimSpace(strings.ToLower(typ))
	switch typ {
	case "nip", "nip_transfer":
		return "nip"
	case "book", "book_transfer":
		return "book"
	default:
		return typ
	}
}

func optionalString(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

func (c *TransferStatusConsumer) emitInAppNotification(ctx context.Context, source string, item domain.InAppNotification) {
	if err := c.repo.CreateInAppNotification(ctx, item); err != nil {
		log.Printf(
			"level=warn component=transfer_consumer flow=notification_emit source=%s type=%s category=%s user_id=%s err=%v",
			source,
			item.Type,
			item.Category,
			item.UserID,
			err,
		)
	}
}

func (c *TransferStatusConsumer) emitRequestPaidNotification(ctx context.Context, request *domain.PaymentRequest, tx *domain.Transaction, payerUsername string) {
	if request == nil || tx == nil {
		return
	}

	body := fmt.Sprintf("Your request \"%s\" has been paid.", request.Title)
	relatedEntityType := "payment_request"
	dedupeKey := fmt.Sprintf("request.paid:%s:%s", request.ID, tx.ID)
	payerID := tx.SenderID

	c.emitInAppNotification(ctx, "request.paid", domain.InAppNotification{
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
			"transaction_id":    tx.ID.String(),
			"amount":            request.Amount,
			"status":            request.Status,
			"display_status":    "paid",
			"paid_by_user_id":   payerID.String(),
			"paid_by_username":  payerUsername,
			"title":             request.Title,
			"description":       request.Description,
			"responded_at":      time.Now().UTC().Format(time.RFC3339),
			"recipient_user_id": optionalUUIDStringFromPointer(request.RecipientUserID),
		},
	})
}

func optionalUUIDStringFromPointer(value *uuid.UUID) string {
	if value == nil {
		return ""
	}
	return value.String()
}

func looksLikeFeeEvent(event domain.TransferStatusEvent) bool {
	if strings.Contains(strings.ToLower(event.Reason), "fee") {
		return true
	}
	if strings.Contains(strings.ToLower(event.EventType), "fee") {
		return true
	}
	return false
}

func (c *TransferStatusConsumer) incrementMissingAttempt(anchorTransferID string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.missingTxAttempts[anchorTransferID]++
	return c.missingTxAttempts[anchorTransferID]
}

func (c *TransferStatusConsumer) clearMissingAttempt(anchorTransferID string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.missingTxAttempts, anchorTransferID)
}

func missingTransferRetryBackoff(attempt int) time.Duration {
	if attempt < 1 {
		return 250 * time.Millisecond
	}

	// Linear backoff with cap keeps retries spread out without stalling consumers for too long.
	delay := time.Duration(attempt) * 250 * time.Millisecond
	if delay > 3*time.Second {
		return 3 * time.Second
	}
	return delay
}
