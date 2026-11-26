# 06 --- Workflows and Failure Handling

## 1. Successful purchase workflow

1.  Customer requests an order through the API Gateway.
2.  Gateway authenticates the customer and forwards the request.
3.  Order Service validates deal eligibility, quantity, and customer
    limits.
4.  In one database transaction, Order Service atomically reserves
    stock, creates the order, stores immutable order-item snapshots,
    creates a reservation and idempotency record, and inserts any
    required outbox event.
5.  API returns the pending order.
6. Customer separately requests a payment attempt.
7. Order Service creates one pending payment attempt and PayHere checkout
   payload from the
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
-   Mark only the payment attempt `FAILED` idempotently.
-   Do not release the active reservation.
-   Leave the order `PENDING_PAYMENT`.
-   Permit another payment attempt before reservation expiry.
-   Release the reservation only through expiry or explicit order
    cancellation.
-   Publish an event for downstream notification only after the
    transaction commits.

Do not release stock merely because the browser displays a failure page.

## 2A. Customer cancellation

An owner or administrator may cancel an order only while its status is
`PENDING_PAYMENT` and its reservation is `ACTIVE`.

The cancellation transaction must:

1. conditionally update the reservation from `ACTIVE` to `RELEASED`;
2. return reserved quantity to available quantity;
3. mark pending payment attempts `CANCELLED`;
4. mark the order `CANCELLED`;
5. insert relevant outbox events;
6. commit.

If another process already committed or expired the reservation, the
cancellation must not increment stock or alter a paid order.

## 2B. Customer purchase-limit enforcement

The 2-unit limit is enforced inside the same PostgreSQL transaction as
stock reservation. PostgreSQL, not Redis or application cache, is the
source of truth.

The exact transaction sequence is:

1. Acquire the idempotency-key row lock or unique-key claim.
2. Acquire the relevant database lock for the customer/deal pair.
3. Acquire the deal row lock if stock is still reserved in the same
   transaction.
4. Calculate paid quantity plus active reserved quantity.
5. Reject the order if the paid quantity plus active reserved quantity
   and requested quantity exceeds 2.
6. Atomically reserve available stock with a conditional update.
7. Create the order and immutable order-item snapshot.
8. Create the active inventory reservation and complete the idempotency
   record.
9. Commit all writes together.

All transactions use a consistent lock order: customer/deal state before
deal stock row, and never the reverse. `PAID` quantities and `COMMITTED`
reservations must not be double counted. `RELEASED`, `EXPIRED`, and
`CANCELLED` reservations do not count.

Concurrent attempts for the same customer/deal pair must produce at most
one valid result set whose sum is no more than 2. The deal stock
reservation is still conditional and transactionally updated.

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

### Late-payment reconciliation record

If a provider-verified success callback is received after an active
reservation has transitioned to `RELEASED` or `EXPIRED`, the Order
Service must, in the same deduplicated callback transaction:

- mark the payment attempt `SUCCESS`;
- mark the order `RECONCILIATION_REQUIRED`;
- leave the reservation in `RELEASED` or `EXPIRED`;
- create exactly one `PENDING_REVIEW` reconciliation record.

The same behavior applies when the reservation is `CANCELLED`. The
reservation remains terminal. The service must not restore sold stock or
create a new reservation solely to fit the payment.

Reconciliation statuses:

- `PENDING_REVIEW`: verified payment requires operator assessment.
- `REFUND_APPROVED`: an operator approved a refund or remediation.
- `REFUND_COMPLETED`: the provider refund/remediation is confirmed by
  the available operational process.
- `CLOSED_NO_ACTION`: an operator closed the record without stock or
  payment changes, with audit notes.

Administrative resolution requires an authenticated administrator and
must record operator identity, notes, status, and timestamps. Resolution
must not automatically increase or decrease stock counters.

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
-   Simultaneous matching requests serialize on the unique key. Only
    one order, item, reservation, and idempotency record is committed.
-   The losing request returns the original committed result after the
    winner commits, or safely retries if the winner rolls back.
-   A completed key is retained for at least 24 hours as a proposed
    cleanup policy. Cleanup must not permit replay to create a second
    order while the original remains relevant.

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

## 10. Refresh-token and session lifecycle

The login or initial refresh creates an active session containing a
hash of an opaque refresh credential and a family identifier.

On refresh:

1. hash the presented credential and match exactly one session;
2. reject expired or revoked sessions;
3. rotate by marking the presented session `ROTATED`, creating a new
   `ACTIVE` session in the same family, and returning the new credential;
4. issue a short-lived access token.

If a previously rotated or revoked credential is reused, revoke every
`ACTIVE` session in that family and record reuse. Logout revokes the
presented refresh session. Password reset, administrator security action,
or account closure may revoke all active sessions for the user.

Refresh credentials are transported through an `HttpOnly`, `Secure`
cookie with appropriately configured `SameSite` and path settings.
Browser JavaScript cannot read the credential. The login/refresh response
returns only the access token to the client JSON response; refresh
responses rotate the cookie. Logout clears the cookie and revokes the
refresh session.

State-changing cookie-authenticated endpoints require CSRF protection
appropriate to the cookie policy, such as origin validation and/or an
anti-CSRF token. Revoking refresh sessions does not immediately
invalidate existing stateless access tokens. Access tokens have a
proposed lifetime of 15 minutes; refresh-token lifetime remains to be
confirmed.

## 11. RabbitMQ acknowledgement and notification delivery

The outbox publisher publishes each record with publisher confirms and
marks it published only after confirmation. At-least-once delivery
remains assumed.

The Notification Service validates the event envelope and payload version
before side effects. In one database transaction it persists the event
ID and creates a `PENDING` notification, commits, and then acknowledges
the RabbitMQ message. A repeated event ID is acknowledged without
creating duplicate notification state or starting external email
delivery.

A background notification worker sends pending emails. Every send creates
a `NotificationDeliveryAttempt` and updates notification/delivery status.

Transient delivery failures are retried with bounded attempts and
backoff. Permanent validation failures are not retried indefinitely and
may be moved to the DLQ. SMTP acceptance is treated as a provider
acknowledgement, while crashes after provider acceptance but before local
status update may result in provider-visible duplicate delivery.

## 12. Essential automated tests

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
-   Concurrent customer requests do not exceed the 2-unit paid-plus-
    active-reservation limit.
-   A duplicate order idempotency key returns the original order; a
    changed payload for the same key is rejected.
-   Cancellation executes stock release and pending-attempt cancellation
    exactly once.
-   Reused refresh credentials revoke the refresh-session family.
-   Duplicate and out-of-order late-payment callbacks create only one
    reconciliation record and no extra stock.
-   Verified success against expired, released, and cancelled reservations
    records payment success and creates reconciliation exactly once.
-   Verified failure marks only the attempt failed and leaves an active
    reservation active.
-   Concurrent payment-attempt requests create only one PENDING attempt.
-   A failed notification consumer delivery is retried, reaches DLQ after
    bounded attempts, and duplicate event delivery is not duplicated.
