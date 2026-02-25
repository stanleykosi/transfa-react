package app

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/transfa/transaction-service/internal/domain"
	"github.com/transfa/transaction-service/internal/store"
)

type consumerStatusTransitionRepoStub struct {
	store.Repository

	tx *domain.Transaction

	updateMetadataCalled bool
	updatedMetadata      store.UpdateTransactionMetadataParams

	markFailedCalled bool
	creditCalled     bool
	refundFeeCalled  bool
	releaseReqCalled bool
}

func (s *consumerStatusTransitionRepoStub) FindTransactionByAnchorTransferID(ctx context.Context, anchorTransferID string) (*domain.Transaction, error) {
	if s.tx == nil {
		return nil, store.ErrTransactionNotFound
	}
	return s.tx, nil
}

func (s *consumerStatusTransitionRepoStub) UpdateTransactionMetadata(ctx context.Context, transactionID uuid.UUID, metadata store.UpdateTransactionMetadataParams) error {
	s.updateMetadataCalled = true
	s.updatedMetadata = metadata
	return nil
}

func (s *consumerStatusTransitionRepoStub) MarkTransactionAsFailed(ctx context.Context, transactionID uuid.UUID, anchorTransferID, failureReason string) error {
	s.markFailedCalled = true
	return nil
}

func (s *consumerStatusTransitionRepoStub) CreditWallet(ctx context.Context, userID uuid.UUID, amount int64) error {
	s.creditCalled = true
	return nil
}

func (s *consumerStatusTransitionRepoStub) RefundTransactionFee(ctx context.Context, transactionID uuid.UUID, userID uuid.UUID, fee int64) error {
	s.refundFeeCalled = true
	return nil
}

func (s *consumerStatusTransitionRepoStub) ReleasePaymentRequestFromProcessingBySettlementTransaction(ctx context.Context, settledTransactionID uuid.UUID) error {
	s.releaseReqCalled = true
	return nil
}

func (s *consumerStatusTransitionRepoStub) CreateInAppNotification(ctx context.Context, item domain.InAppNotification) error {
	return nil
}

func TestProcessEvent_IgnoresPendingReplayForCompletedTransaction(t *testing.T) {
	recipientID := uuid.New()
	repo := &consumerStatusTransitionRepoStub{
		tx: &domain.Transaction{
			ID:          uuid.New(),
			SenderID:    uuid.New(),
			RecipientID: &recipientID,
			Type:        "p2p_transfer",
			Status:      "completed",
			Amount:      1000,
			Fee:         10,
		},
	}
	consumer := NewTransferStatusConsumer(repo)

	event := domain.TransferStatusEvent{
		AnchorTransferID: "atr_completed_replay",
		Status:           "processing",
		Reason:           "late processing replay",
	}

	if err := consumer.processEvent(context.Background(), event); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if !repo.updateMetadataCalled {
		t.Fatal("expected metadata update to persist reference fields")
	}
	if repo.updatedMetadata.Status != nil {
		t.Fatalf("expected status downgrade to be ignored, got %q", *repo.updatedMetadata.Status)
	}
	if repo.updatedMetadata.FailureReason != nil {
		t.Fatalf("expected replay failure reason to be ignored, got %q", *repo.updatedMetadata.FailureReason)
	}
	if repo.markFailedCalled || repo.creditCalled || repo.refundFeeCalled || repo.releaseReqCalled {
		t.Fatal("did not expect failure handling for stale processing replay")
	}
}

func TestProcessEvent_IgnoresFailedReplayForCompletedTransaction(t *testing.T) {
	recipientID := uuid.New()
	repo := &consumerStatusTransitionRepoStub{
		tx: &domain.Transaction{
			ID:          uuid.New(),
			SenderID:    uuid.New(),
			RecipientID: &recipientID,
			Type:        "p2p_transfer",
			Status:      "completed",
			Amount:      1000,
			Fee:         10,
		},
	}
	consumer := NewTransferStatusConsumer(repo)

	event := domain.TransferStatusEvent{
		AnchorTransferID: "atr_failed_replay",
		Status:           "failed",
		Reason:           "late failed replay",
	}

	if err := consumer.processEvent(context.Background(), event); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if !repo.updateMetadataCalled {
		t.Fatal("expected metadata update to persist reference fields")
	}
	if repo.updatedMetadata.Status != nil {
		t.Fatalf("expected stale failed status to be ignored, got %q", *repo.updatedMetadata.Status)
	}
	if repo.markFailedCalled || repo.creditCalled || repo.refundFeeCalled || repo.releaseReqCalled {
		t.Fatal("did not expect failed replay to reverse a completed transfer")
	}
}
