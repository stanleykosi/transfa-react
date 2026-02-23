package app

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/transfa/transaction-service/internal/domain"
	"github.com/transfa/transaction-service/internal/store"
)

type consumerFailureRepoStub struct {
	store.Repository
	dropID uuid.UUID

	resolveErr         error
	requestRetryErr    error
	requestRetryOK     bool
	markErr            error
	resolveCalled      bool
	requestRetryCalled bool
	requestRetryReason string
	markFailed         bool
	creditCalled       bool
	refundFeeCalled    bool
	releaseReqCalled   bool
}

func (s *consumerFailureRepoStub) FindMoneyDropClaimDropIDByTransactionID(ctx context.Context, transactionID uuid.UUID) (uuid.UUID, error) {
	s.resolveCalled = true
	if s.resolveErr != nil {
		return uuid.Nil, s.resolveErr
	}
	return s.dropID, nil
}

func (s *consumerFailureRepoStub) MarkMoneyDropClaimReconcileRequested(ctx context.Context, transactionID uuid.UUID, anchorReason string, failureReason string) (bool, error) {
	s.requestRetryCalled = true
	s.requestRetryReason = anchorReason
	if s.requestRetryErr != nil {
		return false, s.requestRetryErr
	}
	if !s.requestRetryOK {
		return false, nil
	}
	return true, nil
}

func (s *consumerFailureRepoStub) MarkTransactionAsFailed(ctx context.Context, transactionID uuid.UUID, anchorTransferID, failureReason string) error {
	s.markFailed = true
	return s.markErr
}

func (s *consumerFailureRepoStub) CreditWallet(ctx context.Context, userID uuid.UUID, amount int64) error {
	s.creditCalled = true
	return nil
}

func (s *consumerFailureRepoStub) RefundTransactionFee(ctx context.Context, transactionID uuid.UUID, userID uuid.UUID, fee int64) error {
	s.refundFeeCalled = true
	return nil
}

func (s *consumerFailureRepoStub) ReleasePaymentRequestFromProcessingBySettlementTransaction(ctx context.Context, settledTransactionID uuid.UUID) error {
	s.releaseReqCalled = true
	return nil
}

type consumerLookupRepoStub struct {
	store.Repository

	byAnchorTx  *domain.Transaction
	byAnchorErr error

	byReasonTx  *domain.Transaction
	byReasonErr error

	byParticipantsTx      *domain.Transaction
	byParticipantsErr     error
	participantsCalled    bool
	lastAnchorAccountID   string
	lastCounterpartyID    string
	lastParticipantAmount int64

	updateMetadataCalled bool
	updatedTransactionID uuid.UUID
	updatedMetadata      store.UpdateTransactionMetadataParams
}

func (s *consumerLookupRepoStub) FindTransactionByAnchorTransferID(ctx context.Context, anchorTransferID string) (*domain.Transaction, error) {
	if s.byAnchorErr != nil {
		return nil, s.byAnchorErr
	}
	if s.byAnchorTx == nil {
		return nil, store.ErrTransactionNotFound
	}
	return s.byAnchorTx, nil
}

func (s *consumerLookupRepoStub) FindTransactionByID(ctx context.Context, transactionID uuid.UUID) (*domain.Transaction, error) {
	if s.byReasonErr != nil {
		return nil, s.byReasonErr
	}
	if s.byReasonTx == nil {
		return nil, store.ErrTransactionNotFound
	}
	return s.byReasonTx, nil
}

func (s *consumerLookupRepoStub) FindPendingMoneyDropClaimByAnchorParticipantsAndAmount(ctx context.Context, anchorAccountID string, counterpartyID string, amount int64) (*domain.Transaction, error) {
	s.participantsCalled = true
	s.lastAnchorAccountID = anchorAccountID
	s.lastCounterpartyID = counterpartyID
	s.lastParticipantAmount = amount

	if s.byParticipantsErr != nil {
		return nil, s.byParticipantsErr
	}
	if s.byParticipantsTx == nil {
		return nil, store.ErrTransactionNotFound
	}
	return s.byParticipantsTx, nil
}

func (s *consumerLookupRepoStub) UpdateTransactionMetadata(ctx context.Context, transactionID uuid.UUID, metadata store.UpdateTransactionMetadataParams) error {
	s.updateMetadataCalled = true
	s.updatedTransactionID = transactionID
	s.updatedMetadata = metadata
	return nil
}

func TestHandleFailure_MoneyDropClaimMarksRetryRequestedWithoutWalletRefund(t *testing.T) {
	claimantID := uuid.New()
	tx := &domain.Transaction{
		ID:          uuid.New(),
		SenderID:    uuid.New(),
		RecipientID: &claimantID,
		Type:        "money_drop_claim",
		Status:      "pending",
		Amount:      1500,
		Fee:         0,
	}

	repo := &consumerFailureRepoStub{
		dropID:         uuid.New(),
		requestRetryOK: true,
	}
	consumer := NewTransferStatusConsumer(repo)
	event := domain.TransferStatusEvent{
		AnchorTransferID: "atr_test",
		Status:           "failed",
		Reason:           "insufficient funds",
	}

	if err := consumer.handleFailure(context.Background(), tx, event); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if !repo.requestRetryCalled {
		t.Fatal("expected money-drop claim to be marked for reconciliation retry")
	}
	if repo.markFailed {
		t.Fatal("did not expect mark failed fallback when retry marking succeeds")
	}
	if repo.creditCalled || repo.refundFeeCalled || repo.releaseReqCalled {
		t.Fatal("did not expect generic sender refund/payment-request release path for money-drop claims")
	}
}

func TestHandleFailure_MoneyDropClaimUsesGenericRetryMarkerWhenDropLookupFails(t *testing.T) {
	claimantID := uuid.New()
	tx := &domain.Transaction{
		ID:          uuid.New(),
		SenderID:    uuid.New(),
		RecipientID: &claimantID,
		Type:        "money_drop_claim",
		Status:      "pending",
		Amount:      1500,
		Fee:         0,
	}

	repo := &consumerFailureRepoStub{
		dropID:         uuid.New(),
		resolveErr:     errors.New("drop mapping missing"),
		requestRetryOK: true,
	}
	consumer := NewTransferStatusConsumer(repo)
	event := domain.TransferStatusEvent{
		AnchorTransferID: "atr_test",
		Status:           "failed",
		Reason:           "transfer rejected",
	}

	if err := consumer.handleFailure(context.Background(), tx, event); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if !repo.requestRetryCalled {
		t.Fatal("expected retry marker update even when drop lookup fails")
	}
	if repo.requestRetryReason != buildGenericMoneyDropClaimAnchorReason(moneyDropClaimStateRetryRequested) {
		t.Fatalf("expected generic retry anchor reason, got %q", repo.requestRetryReason)
	}
	if repo.markFailed {
		t.Fatal("did not expect fallback to mark failed when retry marker update succeeds")
	}
	if repo.creditCalled || repo.refundFeeCalled || repo.releaseReqCalled {
		t.Fatal("did not expect generic sender refund/payment-request release path for money-drop claims")
	}
}

func TestHandleFailure_MoneyDropClaimRequeuesOnRetryableRetryMarkError(t *testing.T) {
	claimantID := uuid.New()
	tx := &domain.Transaction{
		ID:          uuid.New(),
		SenderID:    uuid.New(),
		RecipientID: &claimantID,
		Type:        "money_drop_claim",
		Status:      "pending",
		Amount:      1500,
		Fee:         0,
	}

	repo := &consumerFailureRepoStub{
		dropID:          uuid.New(),
		requestRetryErr: context.DeadlineExceeded,
	}
	consumer := NewTransferStatusConsumer(repo)
	event := domain.TransferStatusEvent{
		AnchorTransferID: "atr_test",
		Status:           "failed",
		Reason:           "temporary db error",
	}

	err := consumer.handleFailure(context.Background(), tx, event)
	if err == nil {
		t.Fatal("expected retryable error from money-drop claim retry-mark path")
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected deadline exceeded error to bubble up for requeue, got %v", err)
	}
	if repo.markFailed {
		t.Fatal("did not expect fallback to mark failed on retryable revert error")
	}
	if repo.creditCalled || repo.refundFeeCalled || repo.releaseReqCalled {
		t.Fatal("did not expect generic sender refund/payment-request release path for money-drop claims")
	}
}

func TestHandleFailure_MoneyDropClaimUsesAnchorReasonTokenBeforeRepoLookup(t *testing.T) {
	claimantID := uuid.New()
	dropID := uuid.New()
	anchorReason := "md_drop:" + dropID.String() + ";state:transfer_initiated"
	tx := &domain.Transaction{
		ID:           uuid.New(),
		SenderID:     uuid.New(),
		RecipientID:  &claimantID,
		Type:         "money_drop_claim",
		Status:       "pending",
		Amount:       1500,
		Fee:          0,
		AnchorReason: &anchorReason,
	}

	repo := &consumerFailureRepoStub{
		dropID:         uuid.New(),
		resolveErr:     errors.New("should not be called when token exists"),
		requestRetryOK: true,
	}
	consumer := NewTransferStatusConsumer(repo)
	event := domain.TransferStatusEvent{
		AnchorTransferID: "atr_test",
		Status:           "failed",
		Reason:           "transfer rejected",
	}

	if err := consumer.handleFailure(context.Background(), tx, event); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if repo.resolveCalled {
		t.Fatal("did not expect repository drop-id lookup when anchor_reason contains md_drop token")
	}
	expectedReason := buildMoneyDropClaimAnchorReason(dropID, moneyDropClaimStateRetryRequested)
	if repo.requestRetryReason != expectedReason {
		t.Fatalf("expected drop-scoped retry anchor reason %q, got %q", expectedReason, repo.requestRetryReason)
	}
	if repo.markFailed {
		t.Fatal("did not expect failed-status fallback when token-based retry marking succeeds")
	}
}

func TestHandleFailure_MoneyDropClaimDoesNotRevertCompletedClaim(t *testing.T) {
	claimantID := uuid.New()
	tx := &domain.Transaction{
		ID:          uuid.New(),
		SenderID:    uuid.New(),
		RecipientID: &claimantID,
		Type:        "money_drop_claim",
		Status:      "completed",
		Amount:      1500,
		Fee:         0,
	}

	repo := &consumerFailureRepoStub{
		dropID:         uuid.New(),
		requestRetryOK: true,
	}
	consumer := NewTransferStatusConsumer(repo)
	event := domain.TransferStatusEvent{
		AnchorTransferID: "atr_test",
		Status:           "failed",
		Reason:           "late failed webhook replay",
	}

	if err := consumer.handleFailure(context.Background(), tx, event); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if repo.requestRetryCalled {
		t.Fatal("did not expect completed money-drop claim to be marked for retry")
	}
	if repo.markFailed {
		t.Fatal("did not expect completed money-drop claim to be marked failed")
	}
	if repo.creditCalled || repo.refundFeeCalled || repo.releaseReqCalled {
		t.Fatal("did not expect generic sender refund/payment-request release path for completed money-drop claims")
	}
}

func TestProcessEvent_MoneyDropClaimFailedReplaySkipsMetadataUpdateWhenCompleted(t *testing.T) {
	tx := &domain.Transaction{
		ID:       uuid.New(),
		Type:     "money_drop_claim",
		Status:   "completed",
		Amount:   1500,
		SenderID: uuid.New(),
	}

	repo := &consumerLookupRepoStub{
		byAnchorTx: tx,
	}
	consumer := NewTransferStatusConsumer(repo)
	event := domain.TransferStatusEvent{
		AnchorTransferID: "atr_completed_replay",
		Status:           "failed",
		Reason:           "late failed webhook replay",
	}

	if err := consumer.processEvent(context.Background(), event); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if repo.updateMetadataCalled {
		t.Fatal("did not expect metadata update for failed replay on completed money-drop claim")
	}
}

func TestHandleFailure_MoneyDropClaimRetriesReconcileMarkWhenStatusFailed(t *testing.T) {
	claimantID := uuid.New()
	tx := &domain.Transaction{
		ID:          uuid.New(),
		SenderID:    uuid.New(),
		RecipientID: &claimantID,
		Type:        "money_drop_claim",
		Status:      "failed",
		Amount:      1500,
		Fee:         0,
	}

	repo := &consumerFailureRepoStub{
		dropID:         uuid.New(),
		requestRetryOK: true,
	}
	consumer := NewTransferStatusConsumer(repo)
	event := domain.TransferStatusEvent{
		AnchorTransferID: "atr_retry_failed_status",
		Status:           "failed",
		Reason:           "redelivery after transient compensation error",
	}

	if err := consumer.handleFailure(context.Background(), tx, event); err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if !repo.requestRetryCalled {
		t.Fatal("expected retry marker update for failed-status transaction")
	}
	if repo.markFailed {
		t.Fatal("did not expect fallback to mark failed when retry marker update succeeds")
	}
}

func TestFindTransactionForEvent_UsesParticipantFallbackWhenReasonTokenMissing(t *testing.T) {
	tx := &domain.Transaction{
		ID:          uuid.New(),
		SenderID:    uuid.New(),
		RecipientID: ptrUUID(uuid.New()),
		Type:        "money_drop_claim",
		Status:      "pending",
		Amount:      2500,
	}

	repo := &consumerLookupRepoStub{
		byAnchorErr:      store.ErrTransactionNotFound,
		byParticipantsTx: tx,
	}
	consumer := NewTransferStatusConsumer(repo)
	event := domain.TransferStatusEvent{
		AnchorTransferID: "atr_fallback",
		AnchorAccountID:  "anchor_src",
		CounterpartyID:   "anchor_dest",
		Amount:           2500,
		Reason:           "book transfer failed",
	}

	got, err := consumer.findTransactionForEvent(context.Background(), event)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if got == nil || got.ID != tx.ID {
		t.Fatalf("expected fallback transaction %s, got %+v", tx.ID, got)
	}
	if !repo.participantsCalled {
		t.Fatal("expected account-participant fallback lookup to be called")
	}
	if repo.lastAnchorAccountID != event.AnchorAccountID || repo.lastCounterpartyID != event.CounterpartyID || repo.lastParticipantAmount != event.Amount {
		t.Fatalf("unexpected fallback lookup args: anchor=%s counterparty=%s amount=%d", repo.lastAnchorAccountID, repo.lastCounterpartyID, repo.lastParticipantAmount)
	}
}

func TestFindTransactionForEvent_PrefersReasonTokenMatchWhenTransactionAlreadyFailed(t *testing.T) {
	reasonMatchedTx := &domain.Transaction{
		ID:          uuid.New(),
		SenderID:    uuid.New(),
		RecipientID: ptrUUID(uuid.New()),
		Type:        "money_drop_claim",
		Status:      "failed",
		Amount:      2500,
	}
	participantFallbackTx := &domain.Transaction{
		ID:          uuid.New(),
		SenderID:    uuid.New(),
		RecipientID: ptrUUID(uuid.New()),
		Type:        "money_drop_claim",
		Status:      "pending",
		Amount:      2500,
	}

	repo := &consumerLookupRepoStub{
		byAnchorErr:      store.ErrTransactionNotFound,
		byReasonTx:       reasonMatchedTx,
		byParticipantsTx: participantFallbackTx,
	}
	consumer := NewTransferStatusConsumer(repo)
	event := domain.TransferStatusEvent{
		AnchorTransferID: "atr_fallback",
		AnchorAccountID:  "anchor_src",
		CounterpartyID:   "anchor_dest",
		Amount:           2500,
		Reason:           buildMoneyDropClaimTransferReason(reasonMatchedTx.ID, ""),
	}

	got, err := consumer.findTransactionForEvent(context.Background(), event)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if got == nil || got.ID != reasonMatchedTx.ID {
		t.Fatalf("expected reason-token transaction %s, got %+v", reasonMatchedTx.ID, got)
	}
	if repo.participantsCalled {
		t.Fatal("did not expect account-participant fallback lookup when reason token resolves a claim transaction")
	}
}

func ptrUUID(v uuid.UUID) *uuid.UUID {
	return &v
}
