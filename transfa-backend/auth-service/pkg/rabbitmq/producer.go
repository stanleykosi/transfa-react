package rabbitmq

import (
	"context"
	"encoding/json"
	"log"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

// EventProducer is responsible for publishing events to a RabbitMQ exchange.
type EventProducer struct {
	conn    *amqp.Connection
	channel *amqp.Channel
}

// NewEventProducer creates and returns a new EventProducer.
// It establishes a connection and channel to RabbitMQ.
func NewEventProducer(amqpURL string) (*EventProducer, error) {
	conn, err := amqp.Dial(amqpURL)
	if err != nil {
		return nil, err
	}

	ch, err := conn.Channel()
	if err != nil {
		return nil, err
	}

	return &EventProducer{conn: conn, channel: ch}, nil
}

// Publish sends a message to a specific exchange with a routing key.
func (p *EventProducer) Publish(ctx context.Context, exchange, routingKey string, body interface{}) error {
	jsonBody, err := json.Marshal(body)
	if err != nil {
		log.Printf("Error marshalling JSON body: %v", err)
		return err
	}

	err = p.channel.PublishWithContext(ctx,
		exchange,   // exchange
		routingKey, // routing key
		false,      // mandatory
		false,      // immediate
		amqp.Publishing{
			ContentType: "application/json",
			Timestamp:   time.Now(),
			Body:        jsonBody,
		},
	)
	if err != nil {
		log.Printf("Failed to publish a message to exchange '%s': %v", exchange, err)
		return err
	}

	log.Printf("Successfully published message to exchange '%s' with routing key '%s'", exchange, routingKey)
	return nil
}

// Close closes the RabbitMQ connection and channel.
func (p *EventProducer) Close() {
	if p.channel != nil {
		p.channel.Close()
	}
	if p.conn != nil {
		p.conn.Close()
	}
}
