package rabbitmq

import (
	"fmt"
	"log"
	"net/url"
	"strings"

	amqp "github.com/rabbitmq/amqp091-go"
)

type Consumer struct {
	conn *amqp.Connection
	ch   *amqp.Channel
}

func sanitizeURL(raw string) (string, error) {
	clean := strings.TrimSpace(raw)
	clean = strings.Trim(clean, "\"'")
	if !strings.HasSuffix(clean, "/") {
		clean += "/"
	}
	parsed, err := url.Parse(clean)
	if err != nil {
		return "", err
	}
	if parsed.Scheme != "amqp" && parsed.Scheme != "amqps" {
		return "", fmt.Errorf("invalid AMQP scheme: %s", parsed.Scheme)
	}
	return clean, nil
}

func NewConsumer(amqpURL string) (*Consumer, error) {
	cleanURL, err := sanitizeURL(amqpURL)
	if err != nil {
		return nil, err
	}

	conn, err := amqp.Dial(cleanURL)
	if err != nil {
		return nil, err
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, err
	}

	return &Consumer{conn: conn, ch: ch}, nil
}

func (c *Consumer) ConsumeWithBindings(exchange, queueName string, bindings map[string]func([]byte) bool) error {
	if len(bindings) == 0 {
		return fmt.Errorf("no bindings provided")
	}

	if err := c.ch.ExchangeDeclare(exchange, "topic", true, false, false, false, nil); err != nil {
		return err
	}

	q, err := c.ch.QueueDeclare(queueName, true, false, false, false, nil)
	if err != nil {
		return err
	}

	handlers := make(map[string]func([]byte) bool)
	for routingKey, handler := range bindings {
		if handler == nil {
			continue
		}
		handlers[routingKey] = handler
		if err := c.ch.QueueBind(q.Name, routingKey, exchange, false, nil); err != nil {
			return err
		}
	}

	msgs, err := c.ch.Consume(q.Name, "", false, false, false, false, nil)
	if err != nil {
		return err
	}

	go func() {
		for d := range msgs {
			handler, ok := handlers[d.RoutingKey]
			if !ok {
				log.Printf("No handler for routing key %s; acknowledging to drop", d.RoutingKey)
				d.Ack(false)
				continue
			}
			if handler(d.Body) {
				d.Ack(false)
			} else {
				log.Printf("Handler for routing key %s failed; re-queuing", d.RoutingKey)
				d.Nack(false, true)
			}
		}
	}()

	return nil
}

func (c *Consumer) Close() {
	if c.ch != nil {
		c.ch.Close()
	}
	if c.conn != nil {
		c.conn.Close()
	}
}

