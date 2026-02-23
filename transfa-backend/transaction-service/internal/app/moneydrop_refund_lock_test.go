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

type refundLockRepoStub struct {
	store.Repository

	drop                 *domain.MoneyDrop
	creatorAccount       *domain.Account
	moneyDropAccount     *domain.Account
	addRefundedErr       error
	updateEndErr         error
	updateEndErrByReason map[string]error
	restoreActive        bool

	addRefundedCalled            bool
	releaseLockCalled            bool
	releaseRestoreActive         bool
	endMetadataCalled            bool
	endMetadataStatus            string
	endMetadataReason            string
	creditWalletCalled           bool
	updateMoneyDropBalanceCalled bool
	updateAccountBalanceCalled   bool
	createTransactionCalled      bool
}

func (s *refundLockRepoStub) AcquireMoneyDropFinalizationLock(ctx context.Context, dropID uuid.UUID) (bool, bool, error) {
	return true, s.restoreActive, nil
}

func (s *refundLockRepoStub) FindMoneyDropByID(ctx context.Context, dropID uuid.UUID) (*domain.MoneyDrop, error) {
	return s.drop, nil
}

func (s *refundLockRepoStub) FindAccountByUserID(ctx context.Context, userID uuid.UUID) (*domain.Account, error) {
	return s.creatorAccount, nil
}

func (s *refundLockRepoStub) FindMoneyDropAccountByUserID(ctx context.Context, userID uuid.UUID) (*domain.Account, error) {
	return s.moneyDropAccount, nil
}

func (s *refundLockRepoStub) AddMoneyDropRefundedAmount(ctx context.Context, dropID uuid.UUID, amount int64) error {
	s.addRefundedCalled = true
	return s.addRefundedErr
}

func (s *refundLockRepoStub) ReleaseMoneyDropFinalizationLock(ctx context.Context, dropID uuid.UUID, restoreActive bool) error {
	s.releaseLockCalled = true
	s.releaseRestoreActive = restoreActive
	return nil
}

func (s *refundLockRepoStub) UpdateMoneyDropEndMetadata(ctx context.Context, dropID uuid.UUID, status string, endedReason string, endedAt time.Time) error {
	s.endMetadataCalled = true
	s.endMetadataStatus = status
	s.endMetadataReason = endedReason
	if s.updateEndErrByReason != nil {
		if err, ok := s.updateEndErrByReason[endedReason]; ok {
			return err
		}
	}
	return s.updateEndErr
}

func (s *refundLockRepoStub) CreditWallet(ctx context.Context, userID uuid.UUID, amount int64) error {
	s.creditWalletCalled = true
	return nil
}

func (s *refundLockRepoStub) UpdateMoneyDropAccountBalance(ctx context.Context, accountID uuid.UUID, balance int64) error {
	s.updateMoneyDropBalanceCalled = true
	return nil
}

func (s *refundLockRepoStub) UpdateAccountBalance(ctx context.Context, userID uuid.UUID, balance int64) error {
	s.updateAccountBalanceCalled = true
	return nil
}

func (s *refundLockRepoStub) CreateTransaction(ctx context.Context, tx *domain.Transaction) error {
	s.createTransactionCalled = true
	return nil
}

func TestFinalizeMoneyDropWithRefund_KeepsLockClosedAfterPayoutUntilPersistence(t *testing.T) {
	creatorID := uuid.New()
	dropID := uuid.New()
	creatorAccountID := uuid.New()
	moneyDropAccountID := uuid.New()

	repo := &refundLockRepoStub{
		drop: &domain.MoneyDrop{
			ID:                 dropID,
			CreatorID:          creatorID,
			Status:             "active",
			TotalAmount:        10000,
			RefundedAmount:     0,
			AmountPerClaim:     1000,
			TotalClaimsAllowed: 10,
			ClaimsMadeCount:    5,
		},
		creatorAccount: &domain.Account{
			ID:              creatorAccountID,
			UserID:          creatorID,
			AnchorAccountID: "anc_creator_primary",
		},
		moneyDropAccount: &domain.Account{
			ID:              moneyDropAccountID,
			UserID:          creatorID,
			AnchorAccountID: "anc_creator_moneydrop",
		},
		addRefundedErr: errors.New("db unavailable"),
	}

	transferCalls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/v1/accounts/balance/"):
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"data":{"availableBalance":999999}}`)
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/transfers":
			transferCalls++
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"data":{"id":"atr_refund_123","type":"BookTransfer","attributes":{"status":"pending","fee":0}}}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	svc := &Service{
		repo:         repo,
		anchorClient: anchorclient.NewClient(server.URL, "test-key"),
	}

	_, _, _, err := svc.finalizeMoneyDropWithRefund(context.Background(), dropID, creatorID, "expired")
	if err == nil {
		t.Fatal("expected persistence error after successful refund payout")
	}
	if !strings.Contains(err.Error(), "failed to persist money drop refunded amount") {
		t.Fatalf("expected refunded-amount persistence error, got %v", err)
	}
	if transferCalls != 1 {
		t.Fatalf("expected one refund transfer call, got %d", transferCalls)
	}
	if !repo.addRefundedCalled {
		t.Fatal("expected refunded-amount persistence attempt")
	}
	if repo.releaseLockCalled {
		t.Fatal("did not expect finalization lock to be released after external payout succeeded")
	}
	if !repo.endMetadataCalled {
		t.Fatal("expected drop to be marked for manual reconciliation after persistence failure")
	}
	if repo.endMetadataStatus != "completed" {
		t.Fatalf("expected completed status for manual reconciliation marker, got %q", repo.endMetadataStatus)
	}
	if repo.endMetadataReason != "refund_persistence_failed" {
		t.Fatalf("expected refund_persistence_failed reason for manual reconciliation marker, got %q", repo.endMetadataReason)
	}
}

func TestFinalizeMoneyDropWithRefund_DoesNotReopenDropWhenRetryPendingMetadataWriteFails(t *testing.T) {
	creatorID := uuid.New()
	dropID := uuid.New()
	creatorAccountID := uuid.New()
	moneyDropAccountID := uuid.New()

	repo := &refundLockRepoStub{
		drop: &domain.MoneyDrop{
			ID:                 dropID,
			CreatorID:          creatorID,
			Status:             "active",
			TotalAmount:        10000,
			RefundedAmount:     0,
			AmountPerClaim:     1000,
			TotalClaimsAllowed: 10,
			ClaimsMadeCount:    5,
		},
		creatorAccount: &domain.Account{
			ID:              creatorAccountID,
			UserID:          creatorID,
			AnchorAccountID: "anc_creator_primary",
		},
		moneyDropAccount: &domain.Account{
			ID:              moneyDropAccountID,
			UserID:          creatorID,
			AnchorAccountID: "anc_creator_moneydrop",
		},
		updateEndErrByReason: map[string]error{
			moneyDropRetryPendingReason: errors.New("metadata unavailable"),
		},
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/v1/accounts/balance/"):
			w.Header().Set("Content-Type", "application/json")
			if strings.HasSuffix(r.URL.Path, "/anc_creator_moneydrop") {
				_, _ = io.WriteString(w, `{"data":{"availableBalance":2000}}`)
				return
			}
			_, _ = io.WriteString(w, `{"data":{"availableBalance":999999}}`)
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/transfers":
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"data":{"id":"atr_refund_partial","type":"BookTransfer","attributes":{"status":"pending","fee":0}}}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	svc := &Service{
		repo:         repo,
		anchorClient: anchorclient.NewClient(server.URL, "test-key"),
	}

	_, _, _, err := svc.finalizeMoneyDropWithRefund(context.Background(), dropID, creatorID, "manual_end")
	if err == nil {
		t.Fatal("expected retry-pending metadata persistence error")
	}
	if !strings.Contains(err.Error(), "failed to mark money drop refund as retry pending") {
		t.Fatalf("expected retry-pending metadata error, got %v", err)
	}
	if !repo.addRefundedCalled {
		t.Fatal("expected refunded-amount persistence attempt")
	}
	if !repo.endMetadataCalled {
		t.Fatal("expected retry-pending metadata write attempt")
	}
	if repo.releaseLockCalled {
		t.Fatal("did not expect finalization lock to be released into active state after partial refund")
	}
}

func TestFinalizeMoneyDropWithRefund_StopsBeforePayoutWhenInflightMarkerWriteFails(t *testing.T) {
	creatorID := uuid.New()
	dropID := uuid.New()
	creatorAccountID := uuid.New()
	moneyDropAccountID := uuid.New()

	repo := &refundLockRepoStub{
		restoreActive: true,
		drop: &domain.MoneyDrop{
			ID:                 dropID,
			CreatorID:          creatorID,
			Status:             "active",
			TotalAmount:        10000,
			RefundedAmount:     0,
			AmountPerClaim:     1000,
			TotalClaimsAllowed: 10,
			ClaimsMadeCount:    5,
		},
		creatorAccount: &domain.Account{
			ID:              creatorAccountID,
			UserID:          creatorID,
			AnchorAccountID: "anc_creator_primary",
		},
		moneyDropAccount: &domain.Account{
			ID:              moneyDropAccountID,
			UserID:          creatorID,
			AnchorAccountID: "anc_creator_moneydrop",
		},
		updateEndErrByReason: map[string]error{
			moneyDropRefundPayoutInFlight: errors.New("metadata unavailable"),
		},
	}

	transferCalls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && strings.HasPrefix(r.URL.Path, "/api/v1/accounts/balance/"):
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"data":{"availableBalance":999999}}`)
		case r.Method == http.MethodPost && r.URL.Path == "/api/v1/transfers":
			transferCalls++
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, `{"data":{"id":"atr_refund_should_not_happen","type":"BookTransfer","attributes":{"status":"pending","fee":0}}}`)
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	svc := &Service{
		repo:         repo,
		anchorClient: anchorclient.NewClient(server.URL, "test-key"),
	}

	_, _, _, err := svc.finalizeMoneyDropWithRefund(context.Background(), dropID, creatorID, "expired")
	if err == nil {
		t.Fatal("expected in-flight marker persistence error")
	}
	if !strings.Contains(err.Error(), "failed to mark money drop refund payout as in-flight") {
		t.Fatalf("expected in-flight marker error, got %v", err)
	}
	if transferCalls != 0 {
		t.Fatalf("expected zero refund transfer calls when marker write fails, got %d", transferCalls)
	}
	if repo.addRefundedCalled {
		t.Fatal("did not expect refunded-amount persistence when payout never started")
	}
	if !repo.releaseLockCalled {
		t.Fatal("expected finalization lock release when payout did not start")
	}
}

func TestFinalizeMoneyDropWithRefund_ReleaseLockRestoresActiveWhenOriginWasActive(t *testing.T) {
	creatorID := uuid.New()
	repo := &refundLockRepoStub{
		restoreActive: true,
		drop: &domain.MoneyDrop{
			ID:        uuid.New(),
			CreatorID: uuid.New(), // mismatch triggers early error and deferred lock release
		},
	}
	svc := &Service{repo: repo}

	_, _, _, err := svc.finalizeMoneyDropWithRefund(context.Background(), repo.drop.ID, creatorID, "manual_end")
	if err == nil {
		t.Fatal("expected creator mismatch error")
	}
	if !repo.releaseLockCalled {
		t.Fatal("expected finalization lock release")
	}
	if !repo.releaseRestoreActive {
		t.Fatal("expected lock release to restore active state for active-origin lock")
	}
}

func TestFinalizeMoneyDropWithRefund_ReleaseLockKeepsCompletedWhenOriginWasRetry(t *testing.T) {
	creatorID := uuid.New()
	repo := &refundLockRepoStub{
		restoreActive: false,
		drop: &domain.MoneyDrop{
			ID:        uuid.New(),
			CreatorID: uuid.New(), // mismatch triggers early error and deferred lock release
		},
	}
	svc := &Service{repo: repo}

	_, _, _, err := svc.finalizeMoneyDropWithRefund(context.Background(), repo.drop.ID, creatorID, "expired")
	if err == nil {
		t.Fatal("expected creator mismatch error")
	}
	if !repo.releaseLockCalled {
		t.Fatal("expected finalization lock release")
	}
	if repo.releaseRestoreActive {
		t.Fatal("expected lock release to keep completed/retry state for completed-origin lock")
	}
}
