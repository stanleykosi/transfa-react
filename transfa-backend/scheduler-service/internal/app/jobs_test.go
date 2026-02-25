package app

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"

	"github.com/transfa/scheduler-service/internal/config"
	"github.com/transfa/scheduler-service/internal/domain"
)

type jobsRepoStub struct {
	drops         []domain.MoneyDrop
	dropsErr      error
	hasCandidates bool
	candidateErr  error
}

func (s *jobsRepoStub) GetExpiredAndCompletedMoneyDrops(ctx context.Context) ([]domain.MoneyDrop, error) {
	if s.dropsErr != nil {
		return nil, s.dropsErr
	}
	return s.drops, nil
}

func (s *jobsRepoStub) HasPendingMoneyDropClaimReconciliationCandidates(ctx context.Context, olderThan time.Time) (bool, error) {
	if s.candidateErr != nil {
		return false, s.candidateErr
	}
	return s.hasCandidates, nil
}

type jobsTxClientStub struct {
	reconcileCalled bool
}

func (s *jobsTxClientStub) RefundMoneyDrop(ctx context.Context, dropID, creatorID string, amount int64) error {
	return nil
}

func (s *jobsTxClientStub) ReconcileMoneyDropClaims(ctx context.Context, limit int) error {
	s.reconcileCalled = true
	return nil
}

type jobsFeeClientStub struct{}

func (jobsFeeClientStub) GenerateInvoices(ctx context.Context) error  { return nil }
func (jobsFeeClientStub) RunChargeAttempts(ctx context.Context) error { return nil }
func (jobsFeeClientStub) MarkDelinquent(ctx context.Context) error    { return nil }

func newTestJobs(repo Repository, txClient TransactionClient) *Jobs {
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	return NewJobs(repo, txClient, jobsFeeClientStub{}, logger, config.Config{})
}

func TestProcessMoneyDropClaimReconciliation_SkipsWhenNoCandidates(t *testing.T) {
	repo := &jobsRepoStub{hasCandidates: false}
	txClient := &jobsTxClientStub{}
	jobs := newTestJobs(repo, txClient)

	jobs.ProcessMoneyDropClaimReconciliation()

	if txClient.reconcileCalled {
		t.Fatal("expected reconcile call to be skipped when there are no candidates")
	}
}

func TestProcessMoneyDropClaimReconciliation_CallsWhenCandidatesExist(t *testing.T) {
	repo := &jobsRepoStub{hasCandidates: true}
	txClient := &jobsTxClientStub{}
	jobs := newTestJobs(repo, txClient)

	jobs.ProcessMoneyDropClaimReconciliation()

	if !txClient.reconcileCalled {
		t.Fatal("expected reconcile call when candidates exist")
	}
}

func TestProcessMoneyDropClaimReconciliation_ContinuesOnPrecheckError(t *testing.T) {
	repo := &jobsRepoStub{candidateErr: errors.New("db unavailable")}
	txClient := &jobsTxClientStub{}
	jobs := newTestJobs(repo, txClient)

	jobs.ProcessMoneyDropClaimReconciliation()

	if !txClient.reconcileCalled {
		t.Fatal("expected reconcile call even when candidate pre-check fails")
	}
}
