# 05 --- RabbitMQ Event Contracts

## 1. Messaging rules

-   Use versioned event names and payload schemas.
-   Every event has a globally unique `eventId`.
-   Events are immutable facts that have already happened.
-   Include `occurredAt`, `aggregateId`, and `correlationId`.
-   Publish through the transactional outbox.
-   Consumers must be idempotent.
-   Assume at-least-once delivery; do not claim exactly-once delivery.
-   Acknowledge only after successful processing or durable recording of
    the outcome.
-   Use bounded retries and a dead-letter queue.

## 2. Standard envelope

``` json
{
  "eventId": "uuid",
  "eventType": "order.created",
  "eventVersion": 1,
  "occurredAt": "2026-11-25T14:15:00.000Z",
  "producer": "order-service",
  "aggregateType": "order",
  "aggregateId": "order-uuid",
  "correlationId": "request-or-workflow-id",
  "payload": {}
}
```

## 3. Initial event catalog

  ------------------------------------------------------------------------------
  Event                    Producer          Consumer          Purpose
  ------------------------ ----------------- ----------------- -----------------
  `order.created`          Order Service     Notification      Optional
                                             Service           order-created
                                                               email

  `order.paid`             Order Service     Notification      Payment
                                             Service           confirmation
                                                               email

  `payment.attempt_failed` Order Service     Notification      Individual
                                             Service           payment attempt
                                             Service           email

  `order.expired`          Order Service     Notification      Expiry
                                             Service           notification if
                                                               desired
  `payment.reconciliation_required`
                            Order Service     Notification      Optional alert
                                             Service           for manual
                                                               payment review
  ------------------------------------------------------------------------------

Keep the initial catalog small. Do not publish events for every internal
method call.

## 4. Example `order.paid`

``` json
{
  "eventId": "2f2c1b00-0000-4000-8000-000000000001",
  "eventType": "order.paid",
  "eventVersion": 1,
  "occurredAt": "2026-11-25T14:20:00.000Z",
  "producer": "order-service",
  "aggregateType": "order",
  "aggregateId": "c4d3f2a1-0000-4000-8000-000000000001",
  "correlationId": "req-123",
  "payload": {
    "orderId": "c4d3f2a1-0000-4000-8000-000000000001",
    "orderNumber": "FD-2026-000001",
    "customer": {
      "userId": "user-uuid",
      "email": "customer@example.com"
    },
    "currency": "LKR",
    "total": "12500.00",
    "items": [
      {
        "title": "Flash Deal Item",
        "quantity": 1,
        "unitPrice": "12500.00"
      }
    ]
  }
}
```

Include only the customer/order data required by the consumer. Do not
include credentials, provider secrets, or sensitive payment data.

## 4A. `payment.attempt_failed` payload

This event describes one failed provider attempt, not an order
terminal-state change:

``` json
{
  "eventType": "payment.attempt_failed",
  "eventVersion": 1,
  "aggregateType": "payment_attempt",
  "aggregateId": "payment-attempt-uuid",
  "payload": {
    "paymentAttemptId": "payment-attempt-uuid",
    "orderId": "order-uuid",
    "provider": "PAYHERE",
    "failureReason": "sanitized-provider-failure",
    "reservationStatus": "ACTIVE"
  }
}
```

The failed attempt event must not imply that stock was released or that
the order is terminal. The order remains `PENDING_PAYMENT` while its
reservation remains `ACTIVE`.

## 4B. `payment.reconciliation_required` payload

This event describes a verified successful payment that cannot be
settled against a valid active reservation:

``` json
{
  "eventType": "payment.reconciliation_required",
  "eventVersion": 1,
  "aggregateType": "late_payment_reconciliation",
  "aggregateId": "reconciliation-uuid",
  "payload": {
    "reconciliationId": "reconciliation-uuid",
    "paymentAttemptId": "payment-attempt-uuid",
    "orderId": "order-uuid",
    "reservationStatus": "EXPIRED",
    "status": "PENDING_REVIEW"
  }
}
```

The payload must not instruct consumers to restore stock or create a
reservation.

## 5. RabbitMQ topology proposal

-   Exchange: `flash-deal.events` (topic exchange)
-   Notification queue: `notification-service.events`
-   Dead-letter exchange: `flash-deal.dlx`
-   Dead-letter queue: `notification-service.events.dlq`
-   Routing keys:
    -   `order.created`
    -   `order.paid`
    -   `payment.attempt_failed`
    -   `order.expired`
    -   `payment.reconciliation_required`

Exact queue durability, quorum/classic queue choice, TTL, retry
topology, and prefetch settings should be configured and documented
during infrastructure implementation.

## 6. Consumer idempotency

A consumer should: 1. Validate envelope and payload version. 2. Check
whether `eventId` has already been processed. 3. If already processed,
acknowledge without repeating the side effect. 4. Persist a notification
record with a unique event/action key. 5. Send email using a strategy
that handles uncertain SMTP outcomes. 6. Update delivery status. 7.
Persist the notification outcome or delivery status in the same
Notification Service database transaction as the processed event record
where possible. Acknowledge only after durable state has been recorded.

Durable notification states are:

- `PENDING`: event accepted and email not yet successfully sent.
- `SENT`: SMTP provider accepted the message, or the provider-specific
 success acknowledgement was recorded.
- `FAILED`: a retriable or terminal delivery failure was recorded.
- `DLQ`: exhausted delivery moved to operator review.

Use a RabbitMQ retry exchange or bounded retry queue. Retries are
transient and count-bounded. Permanent payload validation errors are
acknowledged and may be routed directly to the DLQ. Acknowledge duplicate delivery immediately after confirming that the
event ID has already been processed.

Notification acceptance and email delivery are separate:

1. Receive and validate the RabbitMQ event.
2. In one Notification Service database transaction, persist the
   processed event ID and insert a `PENDING` notification.
3. Commit the transaction.
4. Acknowledge the RabbitMQ message.
5. A background delivery worker reads pending notifications.
6. The worker creates a `NotificationDeliveryAttempt` for each send.
7. The worker updates the notification and delivery-attempt status.
8. Transient delivery failures are retried by the worker with bounded
   attempts and backoff.

Reject/negative-acknowledge only with a bounded retry policy; poison
messages are routed to the DLQ.

Email delivery can be uncertain if the SMTP provider accepts a message
but the consumer crashes before saving success. Use a stable
notification key and accept that email providers may not offer true
exactly-once delivery.

## 7. Outbox publisher behavior

-   Read unpublished events in batches.
-   Prevent multiple publisher instances from processing the same row
    concurrently (e.g. row locking / `SKIP LOCKED`).
-   Publish with broker publisher confirms.
-   Mark published only after broker confirmation.
-   Retry transient broker failures.
-   Track attempt count and last error.
-   Alert/inspect events that remain unpublished too long.
