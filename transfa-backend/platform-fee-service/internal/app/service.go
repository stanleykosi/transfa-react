/**
 * @description
 * Core business logic for platform fee billing.
 */
package app

import (
	"context"
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/transfa/platform-fee-service/internal/domain"
	"github.com/transfa/platform-fee-service/internal/store"
)

var attemptDays = map[int]bool{0: true, 1: true, 3: true, 5: true, 7: true}

// Repository defines the database operations the service needs.
type Repository interface {
	FindUserIDByClerkUserID(ctx context.Context, clerkUserID string) (string, error)
	GenerateInvoicesForPeriod(ctx context.Context, periodStart, periodEnd, dueAt, graceUntil time.Time) ([]domain.PlatformFeeInvoice, error)
	ListInvoicesByUserID(ctx context.Context, userID string, limit int) ([]domain.PlatformFeeInvoice, error)
	GetLatestInvoiceByUserID(ctx context.Context, userID string) (*domain.PlatformFeeInvoice, error)
	GetInvoiceByID(ctx context.Context, invoiceID string) (*domain.PlatformFeeInvoice, error)
	ListChargeableInvoices(ctx context.Context, now time.Time) ([]domain.PlatformFeeInvoice, error)
	ClaimInvoiceAttempt(ctx context.Context, invoiceID string, attemptAt time.Time, attemptWindowStart time.Time) (*domain.PlatformFeeInvoice, error)
	InsertAttempt(ctx context.Context, invoiceID string, amount int64, status string, failureReason, providerRef *string) error
	HasSuccessfulAttempt(ctx context.Context, invoiceID string) (bool, error)
	MarkInvoicePaid(ctx context.Context, invoiceID string, paidAt time.Time) error
	MarkInvoiceFailed(ctx context.Context, invoiceID string, failureReason string) error
	MarkInvoicesDelinquent(ctx context.Context, now time.Time) ([]domain.PlatformFeeInvoice, error)
}

// TransactionClient defines the interface for charging platform fees.
type TransactionClient interface {
	DebitPlatformFee(ctx context.Context, userID string, amount int64, invoiceID string) (string, error)
}

// EventPublisher defines the interface for publishing events.
type EventPublisher interface {
	Publish(ctx context.Context, exchange, routingKey string, body interface{}) error
}

// Service provides the business logic for platform fee management.
type Service struct {
	repo      Repository
	txClient  TransactionClient
	publisher EventPublisher
	loc       *time.Location
}

// NewService creates a new platform fee service.
func NewService(repo Repository, txClient TransactionClient, publisher EventPublisher, timezone string) Service {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		log.Printf("WARN: invalid timezone %q, defaulting to UTC", timezone)
		loc = time.UTC
	}

	return Service{repo: repo, txClient: txClient, publisher: publisher, loc: loc}
}

// InvoiceGenerationResult summarizes invoice generation output.
type InvoiceGenerationResult struct {
	PeriodStart     time.Time `json:"period_start"`
	PeriodEnd       time.Time `json:"period_end"`
	DueAt           time.Time `json:"due_at"`
	GraceUntil      time.Time `json:"grace_until"`
	InvoicesCreated int64     `json:"invoices_created"`
}

// ChargeAttemptResult summarizes charge attempt processing.
type ChargeAttemptResult struct {
	Evaluated int `json:"evaluated"`
	Attempted int `json:"attempted"`
	Succeeded int `json:"succeeded"`
	Failed    int `json:"failed"`
	Skipped   int `json:"skipped"`
}

// DelinquencyResult summarizes delinquency processing.
type DelinquencyResult struct {
	MarkedDelinquent int64 `json:"marked_delinquent"`
}

// GetStatus returns the user's current platform fee status using Clerk user ID.
func (s Service) GetStatus(ctx context.Context, clerkUserID string) (*domain.PlatformFeeStatus, error) {
	if clerkUserID == "" {
		return nil, errors.New("user ID cannot be empty")
	}

	internalID, err := s.repo.FindUserIDByClerkUserID(ctx, clerkUserID)
	if err != nil {
		return nil, err
	}

	return s.GetStatusByUserID(ctx, internalID)
}

// GetStatusByUserID returns the platform fee status using internal user ID.
func (s Service) GetStatusByUserID(ctx context.Context, userID string) (*domain.PlatformFeeStatus, error) {
	invoice, err := s.repo.GetLatestInvoiceByUserID(ctx, userID)
	if err != nil {
		if errors.Is(err, store.ErrInvoiceNotFound) {
			return &domain.PlatformFeeStatus{Status: "none", IsDelinquent: false, IsWithinGrace: true}, nil
		}
		return nil, err
	}

	if invoice.Status == "pending" || invoice.Status == "failed" || invoice.Status == "delinquent" {
		if ok, err := s.repo.HasSuccessfulAttempt(ctx, invoice.ID); err != nil {
			return nil, err
		} else if ok {
			invoice.Status = "paid"
		}
	}

	now := time.Now().UTC()
	status := domain.PlatformFeeStatus{
		Status:        invoice.Status,
		PeriodStart:   &invoice.PeriodStart,
		PeriodEnd:     &invoice.PeriodEnd,
		DueAt:         &invoice.DueAt,
		GraceUntil:    &invoice.GraceUntil,
		Amount:        invoice.Amount,
		Currency:      invoice.Currency,
		RetryCount:    invoice.RetryCount,
		LastAttemptAt: invoice.LastAttemptAt,
	}

	if invoice.Status == "delinquent" {
		status.IsDelinquent = true
		status.IsWithinGrace = false
		return &status, nil
	}

	if invoice.Status == "paid" || invoice.Status == "waived" {
		status.IsDelinquent = false
		status.IsWithinGrace = true
		return &status, nil
	}

	status.IsWithinGrace = !now.After(invoice.GraceUntil)
	status.IsDelinquent = !status.IsWithinGrace

	if status.IsDelinquent {
		status.Status = "delinquent"
	}

	return &status, nil
}

// ListInvoices returns the user's platform fee invoices.
func (s Service) ListInvoices(ctx context.Context, clerkUserID string) ([]domain.PlatformFeeInvoice, error) {
	internalID, err := s.repo.FindUserIDByClerkUserID(ctx, clerkUserID)
	if err != nil {
		return nil, err
	}

	invoices, err := s.repo.ListInvoicesByUserID(ctx, internalID, 12)
	if err != nil {
		return nil, err
	}

	for i := range invoices {
		if invoices[i].Status == "pending" || invoices[i].Status == "failed" || invoices[i].Status == "delinquent" {
			ok, err := s.repo.HasSuccessfulAttempt(ctx, invoices[i].ID)
			if err != nil {
				return nil, err
			}
			if ok {
				invoices[i].Status = "paid"
			}
		}
	}

	return invoices, nil
}

// GenerateMonthlyInvoices creates invoices for the previous calendar month.
func (s Service) GenerateMonthlyInvoices(ctx context.Context) (*InvoiceGenerationResult, error) {
	now := time.Now().In(s.loc)

	periodEnd := time.Date(now.Year(), now.Month(), 0, 0, 0, 0, 0, s.loc)
	periodStart := time.Date(periodEnd.Year(), periodEnd.Month(), 1, 0, 0, 0, 0, s.loc)
	dueAt := time.Date(periodEnd.Year(), periodEnd.Month(), 1, 0, 5, 0, 0, s.loc).AddDate(0, 1, 0)
	graceUntil := dueAt.AddDate(0, 0, 7)

	invoices, err := s.repo.GenerateInvoicesForPeriod(ctx, periodStart.UTC(), periodEnd.UTC(), dueAt.UTC(), graceUntil.UTC())
	if err != nil {
		return nil, err
	}

	for _, invoice := range invoices {
		s.publishEvent(ctx, "platform_fee.due", invoice, nil)
	}

	return &InvoiceGenerationResult{
		PeriodStart:     periodStart,
		PeriodEnd:       periodEnd,
		DueAt:           dueAt,
		GraceUntil:      graceUntil,
		InvoicesCreated: int64(len(invoices)),
	}, nil
}

// RunChargeAttempts attempts to collect due platform fees.
func (s Service) RunChargeAttempts(ctx context.Context) (*ChargeAttemptResult, error) {
	now := time.Now().UTC()
	invoices, err := s.repo.ListChargeableInvoices(ctx, now)
	if err != nil {
		return nil, err
	}

	result := &ChargeAttemptResult{Evaluated: len(invoices)}
	for _, invoice := range invoices {
		attempted, err := s.attemptInvoiceCharge(ctx, invoice, now)
		if err != nil {
			result.Attempted++
			result.Failed++
			continue
		}
		if !attempted {
			result.Skipped++
			continue
		}
		result.Attempted++
		result.Succeeded++
	}

	return result, nil
}

// ChargeInvoice charges a specific invoice ID if it is eligible.
func (s Service) ChargeInvoice(ctx context.Context, invoiceID string) (*domain.PlatformFeeInvoice, error) {
	invoice, err := s.repo.GetInvoiceByID(ctx, invoiceID)
	if err != nil {
		return nil, err
	}

	attempted, err := s.attemptInvoiceCharge(ctx, *invoice, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	if !attempted {
		return invoice, nil
	}

	return s.repo.GetInvoiceByID(ctx, invoiceID)
}

// MarkDelinquent updates invoices past grace period.
func (s Service) MarkDelinquent(ctx context.Context) (*DelinquencyResult, error) {
	invoices, err := s.repo.MarkInvoicesDelinquent(ctx, time.Now().UTC())
	if err != nil {
		return nil, err
	}

	for _, invoice := range invoices {
		s.publishEvent(ctx, "platform_fee.delinquent", invoice, nil)
	}

	return &DelinquencyResult{MarkedDelinquent: int64(len(invoices))}, nil
}

func (s Service) attemptInvoiceCharge(ctx context.Context, invoice domain.PlatformFeeInvoice, now time.Time) (bool, error) {
	if invoice.Status == "paid" || invoice.Status == "waived" || invoice.Status == "delinquent" {
		return false, nil
	}
	if now.Before(invoice.DueAt) || now.After(invoice.GraceUntil) {
		return false, nil
	}

	attemptWindowStart, ok := s.attemptWindowStart(invoice, now)
	if !ok {
		return false, nil
	}

	claimed, err := s.repo.ClaimInvoiceAttempt(ctx, invoice.ID, now, attemptWindowStart)
	if err != nil {
		return false, err
	}
	if claimed == nil {
		return false, nil
	}

	txID, err := s.txClient.DebitPlatformFee(ctx, claimed.UserID, claimed.Amount, claimed.ID)
	if err != nil {
		failureReason := err.Error()
		if markErr := s.repo.MarkInvoiceFailed(ctx, claimed.ID, failureReason); markErr != nil {
			log.Printf("WARN: failed to mark invoice %s failed: %v", claimed.ID, markErr)
		}
		if attemptErr := s.repo.InsertAttempt(ctx, claimed.ID, claimed.Amount, "failed", &failureReason, nil); attemptErr != nil {
			log.Printf("WARN: failed to insert attempt for invoice %s: %v", claimed.ID, attemptErr)
		}
		claimed.Status = "failed"
		s.publishEvent(ctx, "platform_fee.failed", *claimed, &failureReason)
		return true, err
	}

	if attemptErr := s.repo.InsertAttempt(ctx, claimed.ID, claimed.Amount, "success", nil, &txID); attemptErr != nil {
		log.Printf("WARN: failed to insert success attempt for invoice %s: %v", claimed.ID, attemptErr)
	}
	if err := s.repo.MarkInvoicePaid(ctx, claimed.ID, now); err != nil {
		return true, fmt.Errorf("failed to mark invoice paid: %w", err)
	}

	claimed.Status = "paid"
	s.publishEvent(ctx, "platform_fee.paid", *claimed, nil)

	return true, nil
}

type platformFeeEvent struct {
	UserID        string    `json:"user_id"`
	InvoiceID     string    `json:"invoice_id"`
	Amount        int64     `json:"amount"`
	Currency      string    `json:"currency"`
	Status        string    `json:"status"`
	DueAt         time.Time `json:"due_at"`
	GraceUntil    time.Time `json:"grace_until"`
	FailureReason *string   `json:"failure_reason,omitempty"`
	Timestamp     time.Time `json:"timestamp"`
}

func (s Service) publishEvent(ctx context.Context, routingKey string, invoice domain.PlatformFeeInvoice, failureReason *string) {
	if s.publisher == nil {
		return
	}

	payload := platformFeeEvent{
		UserID:        invoice.UserID,
		InvoiceID:     invoice.ID,
		Amount:        invoice.Amount,
		Currency:      invoice.Currency,
		Status:        invoice.Status,
		DueAt:         invoice.DueAt,
		GraceUntil:    invoice.GraceUntil,
		FailureReason: failureReason,
		Timestamp:     time.Now(),
	}

	if err := s.publisher.Publish(ctx, "transfa.events", routingKey, payload); err != nil {
		log.Printf("WARN: failed to publish platform fee event %s: %v", routingKey, err)
	}
}

func (s Service) attemptWindowStart(invoice domain.PlatformFeeInvoice, now time.Time) (time.Time, bool) {
	dueLocal := invoice.DueAt.In(s.loc)
	nowLocal := now.In(s.loc)

	startDate := time.Date(dueLocal.Year(), dueLocal.Month(), dueLocal.Day(), 0, 0, 0, 0, s.loc)
	nowDate := time.Date(nowLocal.Year(), nowLocal.Month(), nowLocal.Day(), 0, 0, 0, 0, s.loc)
	days := int(nowDate.Sub(startDate).Hours() / 24)
	if !attemptDays[days] {
		return time.Time{}, false
	}

	windowStart := time.Date(dueLocal.Year(), dueLocal.Month(), dueLocal.Day(), dueLocal.Hour(), dueLocal.Minute(), 0, 0, s.loc).AddDate(0, 0, days)
	return windowStart.UTC(), true
}
