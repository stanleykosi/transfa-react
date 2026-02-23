package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/transfa/transaction-service/internal/domain"
	"github.com/transfa/transaction-service/internal/store"
	"github.com/transfa/transaction-service/pkg/anchorclient"
)

const (
	moneyDropClaimReasonTokenPrefix   = "md_claim_tx:"
	moneyDropClaimDropTokenPrefix     = "md_drop:"
	moneyDropClaimStateCreated        = "created"
	moneyDropClaimStateTransferInit   = "transfer_initiated"
	moneyDropClaimStateRetryInflight  = "reconcile_retry_inflight"
	moneyDropClaimStateRetryInit      = "reconcile_retry_initiated"
	moneyDropClaimStateRetryRequested = "reconcile_retry_requested"
	moneyDropClaimStateRetryUnknown   = "reconcile_retry_unknown"
	defaultClaimReconcileLimit        = 100
	maxClaimReconcileLimit            = 500
	claimReconcileRetryEligibilityAge = 2 * time.Minute
	requeueRetryAttempts              = 3
	requeueRetryBackoff               = 150 * time.Millisecond
)

var (
	moneyDropClaimReasonTokenPattern = regexp.MustCompile(`md_claim_tx:([0-9a-fA-F-]{36})`)
	moneyDropClaimDropTokenPattern   = regexp.MustCompile(`md_drop:([0-9a-fA-F-]{36})`)
)

func buildMoneyDropClaimTransferReason(claimTxID uuid.UUID, creatorUsername string) string {
	base := "Money Drop Claim"
	creator := strings.TrimSpace(creatorUsername)
	if creator != "" {
		base = fmt.Sprintf("%s by %s", base, creator)
	}
	return fmt.Sprintf("%s [%s%s]", base, moneyDropClaimReasonTokenPrefix, claimTxID.String())
}

func buildMoneyDropClaimAnchorReason(dropID uuid.UUID, state string) string {
	normalizedState := strings.TrimSpace(state)
	if normalizedState == "" {
		normalizedState = "unknown"
	}
	return fmt.Sprintf("%s%s;state:%s", moneyDropClaimDropTokenPrefix, dropID.String(), normalizedState)
}

func buildGenericMoneyDropClaimAnchorReason(state string) string {
	normalizedState := strings.TrimSpace(state)
	if normalizedState == "" {
		normalizedState = "unknown"
	}
	return fmt.Sprintf("money_drop_claim;state:%s", normalizedState)
}

func anchorReasonContainsState(anchorReason *string, state string) bool {
	if anchorReason == nil {
		return false
	}
	return strings.Contains(strings.TrimSpace(*anchorReason), ";state:"+state)
}

func shouldSkipMoneyDropClaimRetry(anchorReason *string) bool {
	// Automatic retries are only safe for transactions that were explicitly marked
	// for retry after manual/operator verification. "created" and empty reasons are
	// ambiguous because the initial transfer request may have succeeded despite a client-side error.
	if anchorReason == nil || strings.TrimSpace(*anchorReason) == "" {
		return true
	}
	if anchorReasonContainsState(anchorReason, moneyDropClaimStateCreated) {
		return true
	}
	if !anchorReasonContainsState(anchorReason, moneyDropClaimStateRetryRequested) {
		return true
	}

	return anchorReasonContainsState(anchorReason, moneyDropClaimStateTransferInit) ||
		anchorReasonContainsState(anchorReason, moneyDropClaimStateRetryInit) ||
		anchorReasonContainsState(anchorReason, moneyDropClaimStateRetryInflight)
}

func extractMoneyDropClaimTransactionIDFromReason(reason string) (uuid.UUID, bool) {
	matches := moneyDropClaimReasonTokenPattern.FindStringSubmatch(reason)
	if len(matches) < 2 {
		return uuid.Nil, false
	}

	txID, err := uuid.Parse(matches[1])
	if err != nil {
		return uuid.Nil, false
	}
	return txID, true
}

func extractMoneyDropDropIDFromAnchorReason(anchorReason *string) (uuid.UUID, bool) {
	if anchorReason == nil {
		return uuid.Nil, false
	}

	matches := moneyDropClaimDropTokenPattern.FindStringSubmatch(strings.TrimSpace(*anchorReason))
	if len(matches) < 2 {
		return uuid.Nil, false
	}

	dropID, err := uuid.Parse(matches[1])
	if err != nil {
		return uuid.Nil, false
	}
	return dropID, true
}

func (s *Service) resolveMoneyDropDropIDForClaimTransaction(ctx context.Context, tx *domain.Transaction) (uuid.UUID, bool) {
	if tx == nil {
		return uuid.Nil, false
	}
	if dropID, ok := extractMoneyDropDropIDFromAnchorReason(tx.AnchorReason); ok {
		return dropID, true
	}

	dropID, err := s.repo.FindMoneyDropClaimDropIDByTransactionID(ctx, tx.ID)
	if err != nil {
		return uuid.Nil, false
	}
	return dropID, true
}

func (s *Service) handleExplicitMoneyDropClaimReconcileReject(
	ctx context.Context,
	tx *domain.Transaction,
	dropID uuid.UUID,
	hasDropID bool,
	transferErr error,
) error {
	if tx == nil {
		return errors.New("transaction is nil")
	}

	failureReason := fmt.Sprintf("money_drop_claim_reconcile_retry_rejected: %v", transferErr)

	if hasDropID && tx.RecipientID != nil {
		if revertErr := s.repo.RevertMoneyDropClaimAtomic(ctx, dropID, *tx.RecipientID, tx.ID); revertErr == nil {
			log.Printf("level=info component=service flow=money_drop_claim_reconcile msg=\"reverted rejected claim\" transaction_id=%s drop_id=%s claimant_id=%s", tx.ID, dropID, *tx.RecipientID)
			return nil
		} else {
			if isRetryableMoneyDropClaimCompensationError(revertErr) {
				return fmt.Errorf("revert rejected money-drop claim for retry: %w", revertErr)
			}
			log.Printf("level=error component=service flow=money_drop_claim_reconcile msg=\"failed to revert rejected claim; falling back to marking failed\" transaction_id=%s drop_id=%s claimant_id=%s err=%v", tx.ID, dropID, *tx.RecipientID, revertErr)
		}
	}

	status := "failed"
	anchorReason := "money_drop_claim_reconcile_retry_rejected"
	if hasDropID {
		anchorReason = buildMoneyDropClaimAnchorReason(dropID, "reconcile_retry_rejected")
	}
	if metaErr := s.repo.UpdateTransactionMetadata(ctx, tx.ID, store.UpdateTransactionMetadataParams{
		Status:        &status,
		FailureReason: &failureReason,
		AnchorReason:  &anchorReason,
	}); metaErr != nil {
		if markErr := s.repo.MarkTransactionAsFailed(ctx, tx.ID, "", failureReason); markErr != nil {
			return fmt.Errorf("failed to persist rejected-claim failure state: metadata_err=%v mark_failed_err=%w", metaErr, markErr)
		}
		log.Printf("level=warn component=service flow=money_drop_claim_reconcile msg=\"metadata update failed; persisted failed status via fallback\" transaction_id=%s err=%v", tx.ID, metaErr)
	}
	return nil
}

func (s *Service) requeueMoneyDropClaimReconcileRequested(
	ctx context.Context,
	tx *domain.Transaction,
	dropID uuid.UUID,
	hasDropID bool,
	cause error,
) error {
	if tx == nil {
		return errors.New("transaction is nil")
	}

	anchorReason := buildGenericMoneyDropClaimAnchorReason(moneyDropClaimStateRetryRequested)
	if hasDropID {
		anchorReason = buildMoneyDropClaimAnchorReason(dropID, moneyDropClaimStateRetryRequested)
	}
	failureDetail := "explicit reject compensation failed"
	if cause != nil {
		failureDetail = cause.Error()
	}
	failureReason := fmt.Sprintf("money_drop_claim_reconcile_retry_requeue: %s", failureDetail)

	update := store.UpdateTransactionMetadataParams{
		FailureReason: &failureReason,
		AnchorReason:  &anchorReason,
	}
	var lastErr error
	for attempt := 1; attempt <= requeueRetryAttempts; attempt++ {
		lastErr = s.repo.UpdateTransactionMetadata(ctx, tx.ID, update)
		if lastErr == nil {
			return nil
		}
		if !isRetryableMoneyDropClaimCompensationError(lastErr) || attempt == requeueRetryAttempts {
			break
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(requeueRetryBackoff):
		}
	}

	return fmt.Errorf("persist requeue state after explicit reject: %w", lastErr)
}

func (s *Service) ReconcilePendingMoneyDropClaims(ctx context.Context, limit int) (*domain.MoneyDropClaimReconcileResponse, error) {
	if limit <= 0 {
		limit = defaultClaimReconcileLimit
	}
	if limit > maxClaimReconcileLimit {
		limit = maxClaimReconcileLimit
	}

	cutoff := time.Now().UTC().Add(-claimReconcileRetryEligibilityAge)
	candidates, err := s.repo.ListPendingMoneyDropClaimReconciliationCandidates(ctx, limit, cutoff)
	if err != nil {
		return nil, fmt.Errorf("failed to list reconciliation candidates: %w", err)
	}

	result := &domain.MoneyDropClaimReconcileResponse{
		Processed: len(candidates),
	}

	for _, item := range candidates {
		tx, txErr := s.repo.FindTransactionByID(ctx, item.TransactionID)
		if txErr != nil {
			result.RetryFailed++
			log.Printf("level=warn component=service flow=money_drop_claim_reconcile msg=\"candidate lookup failed\" transaction_id=%s err=%v", item.TransactionID, txErr)
			continue
		}

		if tx.Status != "pending" {
			continue
		}
		if tx.AnchorTransferID != nil && strings.TrimSpace(*tx.AnchorTransferID) != "" {
			continue
		}
		dropID, hasDropID := s.resolveMoneyDropDropIDForClaimTransaction(ctx, tx)
		if shouldSkipMoneyDropClaimRetry(tx.AnchorReason) {
			currentAnchorReason := ""
			if tx.AnchorReason != nil {
				currentAnchorReason = strings.TrimSpace(*tx.AnchorReason)
			}
			log.Printf("level=info component=service flow=money_drop_claim_reconcile msg=\"skip candidate not eligible for automatic retry\" transaction_id=%s anchor_reason=%q", tx.ID, currentAnchorReason)
			continue
		}
		inFlightReason := "money_drop_claim_reconcile_retry_inflight"
		if hasDropID {
			inFlightReason = buildMoneyDropClaimAnchorReason(dropID, moneyDropClaimStateRetryInflight)
		} else {
			inFlightReason = buildGenericMoneyDropClaimAnchorReason(moneyDropClaimStateRetryInflight)
		}
		markedInFlight, markErr := s.repo.MarkMoneyDropClaimReconcileInFlight(ctx, tx.ID, inFlightReason)
		if markErr != nil {
			result.RetryFailed++
			log.Printf("level=error component=service flow=money_drop_claim_reconcile msg=\"failed to mark candidate in-flight\" transaction_id=%s err=%v", tx.ID, markErr)
			continue
		}
		if !markedInFlight {
			log.Printf("level=info component=service flow=money_drop_claim_reconcile msg=\"skip candidate no longer eligible for retry\" transaction_id=%s", tx.ID)
			continue
		}

		reason := buildMoneyDropClaimTransferReason(tx.ID, "")
		transferResp, transferErr := s.anchorClient.InitiateBookTransfer(
			ctx,
			item.SourceAnchorAccountID,
			item.DestinationAnchorAccountID,
			reason,
			item.Amount,
		)
		if transferErr != nil {
			result.RetryFailed++

			var anchorErr *anchorclient.ErrorResponse
			if errors.As(transferErr, &anchorErr) && anchorErr.IsExplicitRejection() {
				result.ExplicitAnchorRejects++
				if rejectErr := s.handleExplicitMoneyDropClaimReconcileReject(ctx, tx, dropID, hasDropID, transferErr); rejectErr != nil {
					if isRetryableMoneyDropClaimCompensationError(rejectErr) {
						if requeueErr := s.requeueMoneyDropClaimReconcileRequested(ctx, tx, dropID, hasDropID, rejectErr); requeueErr != nil {
							return nil, fmt.Errorf("failed to requeue explicit-reject compensation failure for transaction %s: %w", tx.ID, requeueErr)
						}
						log.Printf("level=warn component=service flow=money_drop_claim_reconcile msg=\"explicit reject compensation failed transiently; transaction requeued for retry\" transaction_id=%s err=%v", tx.ID, rejectErr)
						continue
					}
					log.Printf("level=error component=service flow=money_drop_claim_reconcile msg=\"failed handling explicit reject\" transaction_id=%s err=%v", tx.ID, rejectErr)
				}
				log.Printf("level=warn component=service flow=money_drop_claim_reconcile msg=\"retry explicitly rejected by anchor\" transaction_id=%s err=%v", tx.ID, transferErr)
				continue
			} else {
				result.AmbiguousFailures++
			}

			anchorReason := "money_drop_claim_reconcile_retry_unknown"
			if hasDropID {
				anchorReason = buildMoneyDropClaimAnchorReason(dropID, moneyDropClaimStateRetryUnknown)
			}
			failureReason := fmt.Sprintf("money_drop_claim_reconcile_retry_unknown: %v", transferErr)
			if metaErr := s.repo.UpdateTransactionMetadata(ctx, tx.ID, store.UpdateTransactionMetadataParams{
				FailureReason: &failureReason,
				AnchorReason:  &anchorReason,
			}); metaErr != nil {
				log.Printf("level=warn component=service flow=money_drop_claim_reconcile msg=\"failed to persist retry failure metadata\" transaction_id=%s err=%v", tx.ID, metaErr)
			}

			log.Printf("level=warn component=service flow=money_drop_claim_reconcile msg=\"retry initiation failed\" transaction_id=%s err=%v", tx.ID, transferErr)
			continue
		}

		anchorTransferID := strings.TrimSpace(transferResp.Data.ID)
		transferType := "book"
		anchorReason := buildGenericMoneyDropClaimAnchorReason(moneyDropClaimStateRetryInit)
		if hasDropID {
			anchorReason = buildMoneyDropClaimAnchorReason(dropID, moneyDropClaimStateRetryInit)
		}
		clearedFailureReason := ""
		metadata := store.UpdateTransactionMetadataParams{
			TransferType:  &transferType,
			FailureReason: &clearedFailureReason,
			AnchorReason:  &anchorReason,
		}
		if anchorTransferID != "" {
			metadata.AnchorTransferID = &anchorTransferID
		}

		if metaErr := s.repo.UpdateTransactionMetadata(ctx, tx.ID, metadata); metaErr != nil {
			if fallbackErr := s.repo.UpdateTransactionStatus(ctx, tx.ID, anchorTransferID, "pending"); fallbackErr != nil {
				result.RetryFailed++
				log.Printf("level=error component=service flow=money_drop_claim_reconcile msg=\"retry initiated but reference persistence failed; transaction left in in-flight state to avoid duplicate payout\" transaction_id=%s anchor_transfer_id=%s metadata_err=%v fallback_err=%v", tx.ID, anchorTransferID, metaErr, fallbackErr)
				continue
			}
			log.Printf("level=warn component=service flow=money_drop_claim_reconcile msg=\"metadata update failed; persisted anchor transfer reference via fallback\" transaction_id=%s anchor_transfer_id=%s err=%v", tx.ID, anchorTransferID, metaErr)
		}

		result.Retried++
		log.Printf("level=info component=service flow=money_drop_claim_reconcile msg=\"retry initiated\" transaction_id=%s anchor_transfer_id=%s", tx.ID, anchorTransferID)
	}

	return result, nil
}
