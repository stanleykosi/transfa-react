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
	tx, err := c.repo.FindTransactionByAnchorTransferID(ctx, event.AnchorTransferID)
	if err != nil {
		return fmt.Errorf("lookup transaction: %w", err)
	}

	status := normalizeStatus(event.Status)
	transferType := normalizeTransferType(event.TransferType)

	metadata := store.UpdateTransactionMetadataParams{
		Status:           optionalString(status),
		AnchorTransferID: optionalString(event.AnchorTransferID),
		TransferType:     optionalString(transferType),
		FailureReason:    optionalString(event.Reason),
		AnchorSessionID:  optionalString(event.SessionID),
		AnchorReason:     optionalString(event.Reason),
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

func (c *TransferStatusConsumer) handleFailure(ctx context.Context, tx *domain.Transaction, event domain.TransferStatusEvent) error {
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

	return nil
}

func (c *TransferStatusConsumer) handleSuccess(ctx context.Context, tx *domain.Transaction, event domain.TransferStatusEvent) error {
	if tx.Status == "completed" {
		return nil
	}
	return c.repo.MarkTransactionAsCompleted(ctx, tx.ID, event.AnchorTransferID)
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
