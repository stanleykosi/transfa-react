package rabbitmq

import (
    "context"
    "encoding/json"
    "errors"
    "log"
    "net/url"
    "strings"
    "time"

    amqp "github.com/rabbitmq/amqp091-go"
)

// EventProducer is responsible for publishing events to a RabbitMQ exchange.
type EventProducer struct {
	conn    *amqp.Connection
	channel *amqp.Channel
}

// Publisher is the interface implemented by types that can publish events.
type Publisher interface {
    Publish(ctx context.Context, exchange, routingKey string, body interface{}) error
    Close()
}

// EventProducerFallback is a minimal no-op publisher used when RabbitMQ is unavailable at startup.
// It allows the service to start and log events instead of failing hard.
type EventProducerFallback struct{}

func (p *EventProducerFallback) Publish(ctx context.Context, exchange, routingKey string, body interface{}) error {
    log.Printf("[MQ-FALLBACK] Would publish to exchange='%s' routingKey='%s' body=%v", exchange, routingKey, body)
    return nil
}
func (p *EventProducerFallback) Close() {}

func sanitizeAMQPURL(raw string) (string, error) {
	clean := strings.TrimSpace(raw)
	clean = strings.Trim(clean, "\"'")
	// If any stray characters precede the scheme, slice from first occurrence of amqp
	idx := strings.Index(strings.ToLower(clean), "amqp")
	if idx > 0 {
		clean = clean[idx:]
	}
	u, err := url.Parse(clean)
	if err != nil {
		return "", err
	}
	if u.Scheme != "amqp" && u.Scheme != "amqps" {
		return "", errors.New("AMQP scheme must be either 'amqp://' or 'amqps://'")
	}
	return clean, nil
}

// NewEventProducer creates and returns a new EventProducer.
// It establishes a connection and channel to RabbitMQ.
func NewEventProducer(amqpURL string) (*EventProducer, error) {
	cleanURL, err := sanitizeAMQPURL(amqpURL)
	if err != nil {
		return nil, err
	}

    // Use a bounded dial timeout so startup does not hang indefinitely
    conn, err := amqp.DialConfig(cleanURL, amqp.Config{Dial: amqp.DefaultDial(10 * time.Second)})
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
    // Ensure the exchange exists (durable topic)
    if err := p.channel.ExchangeDeclare(
        exchange, // name
        "topic",  // type
        true,      // durable
        false,     // autoDelete
        false,     // internal
        false,     // noWait
        nil,       // args
    ); err != nil {
        log.Printf("Failed to declare exchange '%s': %v. Attempting channel reopen...", exchange, err)
        // Attempt simple channel reopen once
        if p.conn != nil {
            if ch, chErr := p.conn.Channel(); chErr == nil {
                p.channel = ch
                if err2 := p.channel.ExchangeDeclare(exchange, "topic", true, false, false, false, nil); err2 != nil {
                    return err2
                }
            } else {
                return chErr
            }
        } else {
            return err
        }
    }

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
        // One-shot retry: reopen channel and try again
        if p.conn != nil {
            if ch, chErr := p.conn.Channel(); chErr == nil {
                p.channel = ch
                // re-declare exchange and retry
                if exErr := p.channel.ExchangeDeclare(exchange, "topic", true, false, false, false, nil); exErr == nil {
                    err = p.channel.PublishWithContext(ctx, exchange, routingKey, false, false, amqp.Publishing{
                        ContentType: "application/json",
                        Timestamp:   time.Now(),
                        Body:        jsonBody,
                    })
                    if err == nil {
                        log.Printf("Successfully published message to exchange '%s' after retry", exchange)
                        return nil
                    }
                }
            }
        }
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
