# 06 --- Workflows and Failure Handling

## 1. Successful purchase workflow

1.  Customer requests an order through the API Gateway.
2.  Gateway authenticates the customer and forwards the request.
3.  Order Service validates deal eligibility, quantity, and customer
    limits.
4.  In one database transaction, Order Service atomically reserves
    stock, creates the order, stores immutable order-item snapshots,
    creates a reservation, and inserts any required outbox event.
5.  API returns the pending order.
6.  Customer requests a payment attempt.
7.  Order Service creates a PayHere Sandbox checkout payload from the
    stored order amount and provider configuration.
8.  Customer completes checkout on PayHere.
9.  PayHere sends a server-to-server notification.
10. Order Service verifies the notification according to PayHere's
    current specification.
11. In a database transaction, it deduplicates the notification, marks
    the payment attempt successful, commits the reservation into sold
    stock, marks the order paid, and inserts `order.paid` into the
    outbox.
12. Outbox publisher publishes the event.
13. Notification Service consumes it idempotently and sends a
    confirmation email.
14. Customer reads the order status from the API.

## 2. Payment failure

-   Verify and correlate the provider notification.
-   Mark the payment attempt failed idempotently.
-   If no other valid payment attempt is in progress and business rules
    permit, release the active reservation.
-   Mark the order failed or leave it eligible for another attempt
    according to the chosen retry policy.
-   Publish an event for downstream notification only after the
    transaction commits.

Do not release stock merely because the browser displays a failure page.

## 3. Reservation expiry

A scheduled worker periodically finds active reservations whose expiry
time has passed.

For each reservation: 1. Start a transaction. 2. Lock or conditionally
update the reservation only if it is still `ACTIVE` and expired. 3.
Release reserved quantity back to available quantity. 4. Mark
reservation `EXPIRED`. 5. Update the order state if no successful
payment has been recorded. 6. Insert an outbox event. 7. Commit.

The worker must be safe to run concurrently on multiple application
instances.

## 4. Race: payment notification vs expiry worker

Both processes may attempt to transition the same reservation.

Required behavior: - Only one conditional state transition may win. -
The transaction that wins updates the stock counters consistently. - A
late verified success must not be silently discarded. - If stock was
already released and cannot safely be re-reserved, mark the
payment/order for reconciliation and alert an operator. The MVP should
not oversell automatically. - Define the customer remediation path
(manual review/refund) before production use.

This is a critical design case and must have automated tests.

## 5. Duplicate PayHere notification

-   Persist a provider notification identifier or a stable deduplication
    key derived from verified callback fields.
-   Enforce uniqueness in the database.
-   If the same notification is received again, return the
    provider-appropriate acknowledgement without repeating the business
    transition.
-   If PayHere does not provide a suitable unique notification ID,
    define a carefully reviewed composite key and payload hash. Do not
    assume a field is unique without verifying provider documentation.

## 6. Customer double-click / network retry

-   Support an idempotency key on order creation.
-   Store the key scoped to the authenticated customer and operation.
-   Repeated requests with the same key return the original result.
-   A different key represents a new request and must still pass stock
    checks.

## 7. RabbitMQ unavailable

-   Business transaction still commits with its outbox record.
-   Publisher retries later.
-   Do not fail a successful order solely because RabbitMQ is
    temporarily unavailable.
-   Monitor outbox backlog age and size.

## 8. Notification consumer unavailable

-   RabbitMQ retains durable messages according to queue configuration.
-   Consumer resumes when available.
-   Duplicate delivery is expected and handled through idempotency.
-   Poison messages eventually move to the DLQ for investigation.

## 9. PayHere unavailable

-   Do not create a fake successful payment.
-   Keep order/reservation state consistent.
-   Provide a retryable payment initiation path while reservation
    remains valid.
-   If reservation expires, follow the expiry/late-payment policy.

## 10. Essential automated tests

-   Two or more concurrent buyers compete for the final unit.
-   Quantity exceeds remaining stock.
-   Reservation release attempted twice.
-   Payment success callback delivered twice.
-   Payment failure callback delivered twice.
-   Payment success races reservation expiry.
-   Invalid callback signature/hash.
-   Callback amount/currency/order reference mismatch.
-   Outbox publish failure and later recovery.
-   Consumer receives the same event twice.
-   Customer attempts to read another customer's order.
-   Customer attempts an admin-only operation.
