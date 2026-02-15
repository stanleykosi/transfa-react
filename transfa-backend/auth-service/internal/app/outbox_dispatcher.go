package app

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/transfa/auth-service/internal/store"
	"github.com/transfa/auth-service/pkg/rabbitmq"
)

const (
	defaultBatchSize       = 50
	defaultPollInterval    = 1200 * time.Millisecond
	defaultStaleProcessing = 2 * time.Minute
)

type OutboxDispatcher struct {
	repo                store.UserRepository
	rabbitURL           string
	batchSize           int
	pollInterval        time.Duration
	staleProcessingTime time.Duration
	producer            *rabbitmq.EventProducer
}

func NewOutboxDispatcher(repo store.UserRepository, rabbitURL string) *OutboxDispatcher {
	return &OutboxDispatcher{
		repo:                repo,
		rabbitURL:           rabbitURL,
		batchSize:           defaultBatchSize,
		pollInterval:        defaultPollInterval,
		staleProcessingTime: defaultStaleProcessing,
	}
}

func (d *OutboxDispatcher) Run(ctx context.Context) {
	ticker := time.NewTicker(d.pollInterval)
	defer ticker.Stop()
	defer d.closeProducer()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := d.flushOnce(ctx); err != nil {
				log.Printf("Outbox flush error: %v", err)
			}
		}
	}
}

func (d *OutboxDispatcher) flushOnce(ctx context.Context) error {
	staleAfterSeconds := int(d.staleProcessingTime.Seconds())
	messages, err := d.repo.ClaimOutboxMessages(ctx, d.batchSize, staleAfterSeconds)
	if err != nil {
		return err
	}
	if len(messages) == 0 {
		return nil
	}

	for _, message := range messages {
		if err := d.publishMessage(ctx, message); err != nil {
			retryAfter := retryDelaySeconds(message.Attempts)
			_ = d.repo.MarkOutboxFailed(ctx, message.ID, retryAfter, err.Error())
			continue
		}
		if err := d.repo.MarkOutboxPublished(ctx, message.ID); err != nil {
			log.Printf("Failed to mark outbox message %d as published: %v", message.ID, err)
		}
	}
	return nil
}

func (d *OutboxDispatcher) publishMessage(ctx context.Context, message store.OutboxMessage) error {
	if d.producer == nil {
		producer, err := rabbitmq.NewEventProducer(d.rabbitURL)
		if err != nil {
			return err
		}
		d.producer = producer
	}

	var payload interface{}
	if err := json.Unmarshal(message.Payload, &payload); err != nil {
		return err
	}

	if err := d.producer.Publish(ctx, message.Exchange, message.RoutingKey, payload); err != nil {
		d.closeProducer()
		return err
	}
	return nil
}

func (d *OutboxDispatcher) closeProducer() {
	if d.producer != nil {
		d.producer.Close()
		d.producer = nil
	}
}

func retryDelaySeconds(attempt int) int {
	if attempt < 1 {
		return 1
	}
	delay := 1 << minInt(attempt, 8)
	if delay > 300 {
		return 300
	}
	return delay
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
