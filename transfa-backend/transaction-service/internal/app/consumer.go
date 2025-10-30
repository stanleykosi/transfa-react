package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/transfa/transaction-service/internal/domain"
	"github.com/transfa/transaction-service/internal/store"
)

type TransferStatusConsumer struct {
	repo store.Repository
}

func NewTransferStatusConsumer(repo store.Repository) *TransferStatusConsumer {
	return &TransferStatusConsumer{repo: repo}
}

func (c *TransferStatusConsumer) HandleMessage(body []byte) bool {
	var event domain.TransferStatusEvent
	if err := json.Unmarshal(body, &event); err != nil {
		log.Printf("transfer-consumer: failed to unmarshal payload: %v", err)
		return true
	}

	if event.AnchorTransferID == "" {
		log.Printf("transfer-consumer: missing anchor transfer id in event %+v", event)
		return true
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := c.processEvent(ctx, event); err != nil {
		log.Printf("transfer-consumer: processing error for transfer %s: %v", event.AnchorTransferID, err)
		return false
	}

	return true
}

func (c *TransferStatusConsumer) processEvent(ctx context.Context, event domain.TransferStatusEvent) error {
	tx, err := c.repo.FindTransactionByAnchorTransferID(ctx, event.AnchorTransferID)
	if err != nil {
		if errors.Is(err, store.ErrTransactionNotFound) {
			log.Printf("transfer-consumer: no transaction found for anchor transfer %s; acknowledging", event.AnchorTransferID)
			return nil
		}
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
		log.Printf("transfer-consumer: fee refund warning for tx %s: %v", tx.ID, err)
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
	case "failed", "failure":
		return "failed"
	case "initiated", "processing", "pending":
		return "processing"
	default:
		return status
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
