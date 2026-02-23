package app

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/transfa/transaction-service/internal/domain"
	"github.com/transfa/transaction-service/internal/store"
	"github.com/transfa/transaction-service/pkg/anchorclient"
)

type reconcileRejectRepoStub struct {
	store.Repository

	revertErr     error
	updateMetaErr error
	markFailedErr error

	revertCalled         bool
	updateMetadataCalled bool
	markFailedCalled     bool
}

type reconcileLoopRepoStub struct {
	store.Repository

	candidate domain.PendingMoneyDropClaimReconciliationCandidate
	tx        *domain.Transaction

	revertErr     error
	updateMetaErr error

	revertCalled        bool
	markInFlightCalled  bool
	markInFlightReason  string
	updateMetadataCalls []store.UpdateTransactionMetadataParams
	updateMetadataTxIDs []uuid.UUID
}

func (s *reconcileRejectRepoStub) RevertMoneyDropClaimAtomic(ctx context.Context, dropID, claimantID, claimTransactionID uuid.UUID) error {
	s.revertCalled = true
	return s.revertErr
}

func (s *reconcileRejectRepoStub) UpdateTransactionMetadata(ctx context.Context, transactionID uuid.UUID, metadata store.UpdateTransactionMetadataParams) error {
	s.updateMetadataCalled = true
	return s.updateMetaErr
}

func (s *reconcileRejectRepoStub) MarkTransactionAsFailed(ctx context.Context, transactionID uuid.UUID, anchorTransferID, failureReason string) error {
	s.markFailedCalled = true
	return s.markFailedErr
}

func (s *reconcileLoopRepoStub) ListPendingMoneyDropClaimReconciliationCandidates(ctx context.Context, limit int, olderThan time.Time) ([]domain.PendingMoneyDropClaimReconciliationCandidate, error) {
	return []domain.PendingMoneyDropClaimReconciliationCandidate{s.candidate}, nil
}

func (s *reconcileLoopRepoStub) FindTransactionByID(ctx context.Context, transactionID uuid.UUID) (*domain.Transaction, error) {
	return s.tx, nil
}

func (s *reconcileLoopRepoStub) MarkMoneyDropClaimReconcileInFlight(ctx context.Context, transactionID uuid.UUID, anchorReason string) (bool, error) {
	s.markInFlightCalled = true
	s.markInFlightReason = anchorReason
	return true, nil
}

func (s *reconcileLoopRepoStub) RevertMoneyDropClaimAtomic(ctx context.Context, dropID, claimantID, claimTransactionID uuid.UUID) error {
	s.revertCalled = true
	return s.revertErr
}

func (s *reconcileLoopRepoStub) UpdateTransactionMetadata(ctx context.Context, transactionID uuid.UUID, metadata store.UpdateTransactionMetadataParams) error {
	s.updateMetadataTxIDs = append(s.updateMetadataTxIDs, transactionID)
	s.updateMetadataCalls = append(s.updateMetadataCalls, metadata)
	return s.updateMetaErr
}

func TestHandleExplicitMoneyDropClaimReconcileReject_RequeuesRetryableRevertError(t *testing.T) {
	claimantID := uuid.New()
	tx := &domain.Transaction{
		ID:          uuid.New(),
		RecipientID: &claimantID,
	}

	repo := &reconcileRejectRepoStub{
		revertErr: context.DeadlineExceeded,
	}
	svc := &Service{repo: repo}

	err := svc.handleExplicitMoneyDropClaimReconcileReject(
		context.Background(),
		tx,
		uuid.New(),
		true,
		errors.New("explicit anchor reject"),
	)
	if err == nil {
		t.Fatal("expected retryable revert error to bubble up")
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected deadline exceeded error for requeue, got %v", err)
	}
	if !repo.revertCalled {
		t.Fatal("expected claim revert attempt")
	}
	if repo.updateMetadataCalled {
		t.Fatal("did not expect failed-state metadata update for retryable revert error")
	}
	if repo.markFailedCalled {
		t.Fatal("did not expect mark-failed fallback for retryable revert error")
	}
}

func TestHandleExplicitMoneyDropClaimReconcileReject_FallsBackOnNonRetryableRevertError(t *testing.T) {
	claimantID := uuid.New()
	tx := &domain.Transaction{
		ID:          uuid.New(),
		RecipientID: &claimantID,
	}

	repo := &reconcileRejectRepoStub{
		revertErr: errors.New("permanent revert failure"),
	}
	svc := &Service{repo: repo}

	err := svc.handleExplicitMoneyDropClaimReconcileReject(
		context.Background(),
		tx,
		uuid.New(),
		true,
		errors.New("explicit anchor reject"),
	)
	if err != nil {
		t.Fatalf("expected fallback path to persist failed state, got %v", err)
	}
	if !repo.revertCalled {
		t.Fatal("expected claim revert attempt")
	}
	if !repo.updateMetadataCalled {
		t.Fatal("expected failed-state metadata update on non-retryable revert error")
	}
}

func TestReconcilePendingMoneyDropClaims_RequeuesRetryableExplicitRejectCompensationFailure(t *testing.T) {
	txID := uuid.New()
	dropID := uuid.New()
	claimantID := uuid.New()
	anchorReason := buildMoneyDropClaimAnchorReason(dropID, moneyDropClaimStateRetryRequested)

	repo := &reconcileLoopRepoStub{
		candidate: domain.PendingMoneyDropClaimReconciliationCandidate{
			TransactionID:              txID,
			SourceAnchorAccountID:      "anc_source",
			DestinationAnchorAccountID: "anc_dest",
			Amount:                     1500,
		},
		tx: &domain.Transaction{
			ID:           txID,
			Type:         "money_drop_claim",
			Status:       "pending",
			Amount:       1500,
			RecipientID:  &claimantID,
			AnchorReason: &anchorReason,
		},
		revertErr: context.DeadlineExceeded,
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/api/v1/transfers" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, `{"errors":[{"title":"Rejected","detail":"insufficient funds","status":"400"}]}`)
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	svc := &Service{
		repo:         repo,
		anchorClient: anchorclient.NewClient(server.URL, "test-key"),
	}

	resp, err := svc.ReconcilePendingMoneyDropClaims(context.Background(), 1)
	if err != nil {
		t.Fatalf("expected reconcile run to continue after requeue, got %v", err)
	}
	if resp == nil {
		t.Fatal("expected reconcile response")
	}
	if resp.Processed != 1 || resp.RetryFailed != 1 || resp.ExplicitAnchorRejects != 1 || resp.Retried != 0 {
		t.Fatalf("unexpected reconcile summary: %+v", *resp)
	}
	if !repo.markInFlightCalled {
		t.Fatal("expected candidate to be marked in-flight before retry")
	}
	if !strings.Contains(repo.markInFlightReason, ";state:"+moneyDropClaimStateRetryInflight) {
		t.Fatalf("expected in-flight anchor reason, got %q", repo.markInFlightReason)
	}
	if !repo.revertCalled {
		t.Fatal("expected explicit-reject helper to attempt claim revert")
	}
	if len(repo.updateMetadataCalls) != 1 {
		t.Fatalf("expected one metadata update for requeue, got %d", len(repo.updateMetadataCalls))
	}
	got := repo.updateMetadataCalls[0]
	if got.AnchorReason == nil {
		t.Fatal("expected requeue to persist anchor reason")
	}
	expectedAnchorReason := buildMoneyDropClaimAnchorReason(dropID, moneyDropClaimStateRetryRequested)
	if *got.AnchorReason != expectedAnchorReason {
		t.Fatalf("expected anchor reason %q, got %q", expectedAnchorReason, *got.AnchorReason)
	}
	if got.FailureReason == nil || !strings.Contains(*got.FailureReason, "retry_requeue") {
		t.Fatalf("expected requeue failure reason marker, got %v", got.FailureReason)
	}
}

func TestReconcilePendingMoneyDropClaims_PropagatesRequeueFailure(t *testing.T) {
	txID := uuid.New()
	dropID := uuid.New()
	claimantID := uuid.New()
	anchorReason := buildMoneyDropClaimAnchorReason(dropID, moneyDropClaimStateRetryRequested)

	repo := &reconcileLoopRepoStub{
		candidate: domain.PendingMoneyDropClaimReconciliationCandidate{
			TransactionID:              txID,
			SourceAnchorAccountID:      "anc_source",
			DestinationAnchorAccountID: "anc_dest",
			Amount:                     1500,
		},
		tx: &domain.Transaction{
			ID:           txID,
			Type:         "money_drop_claim",
			Status:       "pending",
			Amount:       1500,
			RecipientID:  &claimantID,
			AnchorReason: &anchorReason,
		},
		revertErr:     context.DeadlineExceeded,
		updateMetaErr: context.DeadlineExceeded,
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && r.URL.Path == "/api/v1/transfers" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			_, _ = io.WriteString(w, `{"errors":[{"title":"Rejected","detail":"insufficient funds","status":"400"}]}`)
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	svc := &Service{
		repo:         repo,
		anchorClient: anchorclient.NewClient(server.URL, "test-key"),
	}

	resp, err := svc.ReconcilePendingMoneyDropClaims(context.Background(), 1)
	if err == nil {
		t.Fatal("expected reconcile to return an error when requeue metadata update fails")
	}
	if !strings.Contains(err.Error(), "failed to requeue explicit-reject compensation failure") {
		t.Fatalf("expected requeue failure propagation, got %v", err)
	}
	if resp != nil {
		t.Fatalf("expected nil response on fatal reconcile error, got %+v", *resp)
	}
	if len(repo.updateMetadataCalls) != requeueRetryAttempts {
		t.Fatalf("expected %d requeue metadata update attempts, got %d", requeueRetryAttempts, len(repo.updateMetadataCalls))
	}
}
