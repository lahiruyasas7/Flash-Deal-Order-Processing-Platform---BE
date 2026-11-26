# 03 --- Domain and Database Design

## 1. Ownership

### Order Service database

Owns: - users / credentials (if Auth is kept inside Order Service for
MVP) - deals - orders - order items (even if MVP has one item per
order) - inventory reservations - payment attempts - processed provider
notifications / idempotency records - outbox events

### Notification Service database

Owns: - notification records - delivery attempts - processed event IDs
(if not combined with notification uniqueness constraints)

A later dedicated Auth Service can own identity data. Do not split it
prematurely.

## 2. Proposed entities

### User

-   `id` (UUID)
-   `email` (unique, normalized)
-   `passwordHash`
-   `role` (`ADMIN` or `CUSTOMER`)
-   `createdAt`
-   `updatedAt`

Never return `passwordHash` from APIs.

### RefreshSession

- `id` (UUID)
- `userId`
- `refreshTokenHash` (unique, cryptographically random token digest)
- `familyId` (UUID; identifies one rotation chain)
- `status` (`ACTIVE`, `ROTATED`, `REVOKED`)
- `expiresAt`
- `lastUsedAt`
- `revokedAt` (nullable)
- `replacedBySessionId` (nullable)
- `createdAt`

Only a hash or verifier of the refresh credential is stored. Refresh
tokens are never logged or returned except when freshly issued.

### OrderRequestKey

- `id` (UUID)
- `userId`
- `operation` (`CREATE_ORDER`)
- `idempotencyKey` (client key)
- `requestHash`
- `orderId` (nullable until the original request is committed)
- `status` (`IN_PROGRESS`, `COMPLETED`, `FAILED`)
- `expiresAt`
- `createdAt`
- `completedAt` (nullable)

The uniqueness rule is
`UNIQUE (userId, operation, idempotencyKey)`. The request hash identifies
the intended operation and must match on every reuse. Reusing a key with
a different deal or quantity returns a conflict, not the original order.

Two simultaneous requests with the same key and matching request hash
serialize on the unique database key. Only the transaction that claims
the key creates the order and reservation. The concurrent request must
return the original committed result after the first transaction commits.
If the first transaction rolls back, the loser may retry the idempotency
operation and create one order.

A completed key is retained for at least 24 hours as a proposed default
and must not expire while a customer may still consider the original
order relevant. The exact retention and cleanup policy is an
implementation decision, but cleanup must not allow replay to create a
second order after the original order has already been created.

### Deal

-   `id` (UUID)
-   `title`
-   `description`
-   `originalPrice` (decimal, fixed precision)
-   `dealPrice` (decimal, fixed precision)
-   `totalStock` (integer)
-   `availableStock` (integer)
-   `reservedStock` (integer)
-   `soldStock` (integer)
-   `startsAt` (timestamp with timezone)
-   `endsAt` (timestamp with timezone)
-   `status`
-   `createdAt`
-   `updatedAt`

Invariant: `availableStock + reservedStock + soldStock = totalStock`

The invariant must be preserved by every inventory transition. If the
implementation uses a different counter model, document the equivalent
invariant.

### Order

-   `id` (UUID)
-   `orderNumber` (unique, human-readable)
-   `userId`
- `status` (`PENDING_PAYMENT`, `PAID`, `RECONCILIATION_REQUIRED`,
  `EXPIRED`, `CANCELLED`)
-   `currency` (proposed: LKR)
-   `subtotal`
-   `total`
-   `createdAt`
-   `updatedAt`
-   `paidAt` (nullable)
-   `expiresAt` (nullable)

### OrderItem

-   `id`
-   `orderId`
-   `dealId`
-   `dealTitleSnapshot`
-   `unitPriceSnapshot`
-   `quantity`
-   `lineTotal`

Snapshot fields preserve the purchased terms even if the deal changes
later.

### InventoryReservation

-   `id`
-   `orderId` (unique for one reservation per order in MVP)
-   `dealId`
-   `quantity`
-   `status`
-   `expiresAt`
-   `committedAt` (nullable)
-   `releasedAt` (nullable)
-   `createdAt`

### PaymentAttempt

-   `id`
-   `orderId`
-   `provider` (e.g. `PAYHERE`)
-   `providerReference` / merchant transaction reference
-   `providerPaymentId` (nullable, unique where available)
-   `status`
-   `amount`
-   `currency`
-   `initiatedAt`
-   `completedAt` (nullable)
-   `failureReason` (sanitized, nullable)

An order may have multiple attempts. Enforce that only one attempt can
successfully settle an order.

### ProviderNotification

-   `id`
-   `provider`
-   `providerNotificationKey` (unique where a stable key exists)
-   `paymentAttemptId` (nullable until correlated)
-   `receivedAt`
-   `processedAt`
-   `processingStatus`
-   `payloadHash`
-   Store only the minimum provider payload needed for audit/debugging;
    protect or redact sensitive fields.

### LatePaymentReconciliation

- `id` (UUID)
- `paymentAttemptId`
- `providerNotificationId`
- `orderId`
- `dealId`
- `quantity`
- `reservationStatusAtDetection`
- `status` (`PENDING_REVIEW`, `REFUND_APPROVED`,
  `REFUND_COMPLETED`, `CLOSED_NO_ACTION`)
- `reason`
- `reviewedByUserId` (nullable)
- `resolutionNotes` (nullable)
- `reviewedAt` (nullable)
- `closedAt` (nullable)
- `createdAt`

The record is created only after a verified successful notification
arrives for an order or reservation that can no longer be committed
normally. It prevents silent loss of a verified payment and ensures that
no reconciliation outcome automatically creates new sold stock.

### OutboxEvent

-   `id` (UUID; event ID)
-   `aggregateType`
-   `aggregateId`
-   `eventType`
-   `eventVersion`
-   `payload` (JSON)
-   `occurredAt`
-   `publishedAt` (nullable)
-   `attemptCount`
-   `lastError` (sanitized)

### Notification (Notification Service)

-   `id`
-   `eventId` (unique for one logical notification action)
-   `recipient`
-   `channel` (EMAIL)
-   `templateKey`
-   `status` (`PENDING`, `SENT`, `FAILED`, `DLQ`)
-   `subject`
-   `createdAt`
-   `sentAt` (nullable)
-   `failureReason` (sanitized)

### NotificationDeliveryAttempt

- `id` (UUID)
- `notificationId`
- `attemptNumber`
- `status` (`PENDING`, `SUCCEEDED`, `FAILED`)
- `startedAt`
- `completedAt` (nullable)
- `failureReason` (sanitized, nullable)

The Notification Service creates a `PENDING` notification and commits
it together with its processed event ID. The background delivery worker
then creates delivery-attempt records and updates notification status.

## 3. Lifecycle and modification rules

### Deal lifecycle

The stored deal status is the lifecycle authority. Scheduled activation
and ending are implemented as workers that run conditional transitions:

| From | To | Trigger |
|---|---|---|
| `DRAFT` | `SCHEDULED` | Admin publishes with a future `startsAt` |
| `DRAFT` | `ACTIVE` | Admin publishes with an already-valid window |
| `SCHEDULED` | `ACTIVE` | Scheduled worker reaches `startsAt` |
| `SCHEDULED` | `ACTIVE` | Administrator explicitly activates early |
| `ACTIVE` | `ENDED` | Scheduled worker reaches `endsAt` or admin ends |
| `SCHEDULED` | `CANCELLED` | Admin cancellation |
| `ACTIVE` | `CANCELLED` | Admin cancellation |
| `ENDED`/`CANCELLED` | - | Terminal |

Scheduled workers use conditional updates that require the current
status and valid transition source. They must not overwrite `ENDED`,
`CANCELLED`, or an already-activated deal.

Administrators may cancel `DRAFT`, `SCHEDULED`, and `ACTIVE` deals.
Cancelling an active deal rejects future purchases but does not change
existing paid orders or release reservations automatically; reservations
continue to expire or may be cancelled explicitly.

Editing rules are:

- `DRAFT`: all deal fields may be changed.
- `SCHEDULED`: all deal fields may be changed subject to validation.
- `ACTIVE`: descriptive fields may be changed; price and inventory fields
  are immutable.
- `ENDED`: business fields are immutable.
- `CANCELLED`: business fields are immutable.

The public active-deal query requires `status = ACTIVE`,
`startsAt <= now`, and `endsAt > now`.

### Payment attempt lifecycle

The confirmed payment-attempt states are:

- `PENDING`: attempt exists and checkout is awaiting a server
  notification.
- `SUCCESS`: a verified successful notification was recorded. It
  may be associated with a paid order or with reconciliation when the
  reservation is no longer valid.
- `FAILED`: a verified provider failure was recorded.
- `CANCELLED`: the attempt was explicitly cancelled before completion,
  or the associated order cancellation policy cancels it.
- `EXPIRED`: the attempt outlived the order reservation and could not
  settle the reservation.

Allowed transitions:

| From | To | Trigger |
|---|---|---|
| `PENDING` | `SUCCESS` | Verified success; records payment independently of reservation settlement |
| `PENDING` | `FAILED` | Verified provider failure or validated failure callback |
| `PENDING` | `CANCELLED` | Explicit order cancellation before success |
| `PENDING` | `EXPIRED` | Reservation expires without successful settlement |
| `SUCCESS`/`FAILED`/`CANCELLED`/`EXPIRED` | - | Terminal |

An order may have multiple `PENDING` or terminal payment attempts. Only
one attempt may enter `SUCCESS`. The database must enforce this invariant
through a unique successful attempt key or equivalent transactionally
enforced mechanism.

Retry policy:

- A customer may create a new payment attempt only while the order is
  `PENDING_PAYMENT`, the reservation is `ACTIVE`, and the reservation
  has not expired.
- Provider initiation failure does not create a successful payment.
- A verified failed notification marks only the correlated attempt
  `FAILED` and does not release the reservation. The order remains
  `PENDING_PAYMENT`, and the customer may start another attempt until
  reservation expiry or explicit cancellation.
- A browser redirect alone never transitions an attempt or order.
- An attempt that has been terminal cannot be reused.

## 4. Inventory transitions

### Reserve

Within a transaction, conditionally decrement `availableStock` and
increment `reservedStock` only when: - deal is purchasable, - deal time
window is valid, - `availableStock >= requestedQuantity`.

The same transaction also enforces the customer purchase limit of 2
units for the `(userId, dealId)` pair. The database count is:

- paid order quantity, calculated only from `PAID` orders;
- plus quantity of `ACTIVE` reservations belonging to pending orders;
- excluding `RELEASED`, `EXPIRED`, `CANCELLED`, and `COMMITTED`
  reservations.

To prevent double counting and concurrent bypasses, use one PostgreSQL
transaction, lock the relevant deal row (or use an equivalent
advisory/aggregate locking strategy), calculate paid and reserved units,
and insert the reservation only if the sum plus the requested quantity
is no greater than 2. Redis must not participate in this decision.

Create the order, order item snapshot, reservation, and idempotency
record consistently. Do not create a payment attempt during order
creation. If any required write fails, roll back the transaction.

The exact order creation transaction sequence is:

1. Acquire the order-creation idempotency-key row lock or the unique
   idempotency-key insert lock.
2. Acquire the relevant deal row lock in a consistent global order.
3. Calculate paid quantity plus active reservation quantity for the
   authenticated customer/deal pair.
4. Reject if the requested quantity would exceed 2 units.
5. Atomically reserve stock through a conditional stock update.
6. Create the order and immutable item snapshot.
7. Create the active inventory reservation and complete the idempotency
   record.
8. Commit all writes together.

The consistent lock order is customer/deal pair before deal stock row
when both locks are required. Every order creation for the same
customer/deal pair follows this order. Concurrent tests must cover final
unit stock, simultaneous limit-reaching orders, idempotency-key replay,
and rollback/retry.

### Commit after verified payment

If the reservation is `ACTIVE`, one transaction:

- ensure it is still active and unexpired;
- decrement `reservedStock`;
- increment `soldStock`;
- mark reservation `COMMITTED`;
- mark the payment attempt `SUCCESS`;
- mark the order `PAID`;
- insert `order.paid` outbox event.

If the reservation is already `EXPIRED`, `RELEASED`, or `CANCELLED`,
the verified callback transaction:

- marks the payment attempt `SUCCESS`;
- marks the order `RECONCILIATION_REQUIRED`;
- leaves the reservation in its terminal state;
- creates exactly one `PENDING_REVIEW` reconciliation record;
- does not restore or decrement stock and does not create a reservation;
- inserts `payment.reconciliation_required` outbox event.

### Release after failure/expiry

Within one transaction: - ensure reservation is still `ACTIVE`, -
decrement `reservedStock`, - increment `availableStock`, - mark
reservation `RELEASED` or `EXPIRED`, - update order state according to
the chosen transition, - insert outbox event if needed.

All transitions must be conditional and idempotent.
Verified failed payment callbacks do not use this release transition:
they mark only the payment attempt `FAILED` and leave the active
reservation untouched.

## 5. Concurrency approach

Use PostgreSQL as the source of truth. An atomic conditional update is a
suitable foundation, for example:

``` sql
UPDATE deals
SET available_stock = available_stock - $1,
    reserved_stock = reserved_stock + $1
WHERE id = $2
  AND available_stock >= $1
  AND status = 'ACTIVE'
  AND starts_at <= NOW()
  AND ends_at > NOW()
RETURNING id;
```

If no row is returned, the reservation cannot be made. Execute the
update and related order/reservation writes in a transaction. Review
isolation level and locking behavior for the final Prisma
implementation.

Do not implement inventory correctness using a cache read followed by a
later decrement. Two requests can read the same cached stock value.

## 6. Indexes and constraints

Required uniqueness and critical constraints:

- Unique normalized user email.
- Unique order number.
- Unique `OrderRequestKey (userId, operation, idempotencyKey)`.
- Unique `RefreshSession.refreshTokenHash`.
- Unique `InventoryReservation.orderId` in the MVP one-reservation-per-
  order model.
- Unique provider notification key after PayHere's stable key is
  confirmed from official documentation.
- Unique provider payment ID only if the provider guarantees it.
- Unique outbox event ID.
- Unique notification `eventId` in the Notification Service.
- Only one successful payment attempt per order. Prefer a unique
  `(orderId)` partial index for `status = SUCCESS` or an equivalent
  database-enforced mechanism.
- Only one pending payment attempt per order. Add a partial unique index
  `UNIQUE (orderId) WHERE status = 'PENDING'`.
- Check constraints for positive and integral quantities, non-negative
  stock counters, non-negative total stock, and non-negative prices.
- Check constraint enforcing
  `availableStock + reservedStock + soldStock = totalStock` on Deal.
- Check constraints requiring `endsAt > startsAt`, line snapshot total
  equal to quantity multiplied by unit price where decimal precision
  permits, and valid reservation expiry after creation.

Required indexes:

- Deal `(status, startsAt, endsAt)` for active-deal listing.
- Orders `(userId, createdAt)` for customer history.
- Orders `(status, createdAt)` for operational queries.
- Reservations `(status, expiresAt)` for expiry workers.
- Reservations `(dealId, status)` for purchase-limit counting.
- Payment attempts `(orderId, initiatedAt)`.
- Provider notifications `(providerNotificationKey)` after the key
  design is confirmed.
- Outbox `(publishedAt, occurredAt)` or a partial index for unpublished
  events.
- Refresh sessions `(userId, status, expiresAt)`.
- Late-payment reconciliation `(status, createdAt)`.

Database constraints should enforce critical invariants wherever
practical; application checks alone are insufficient for
concurrency-sensitive rules.

## 7. Money and time

-   Use decimal database types for money, not floating point.
-   Choose and consistently use a currency (LKR proposed).
-   Store timestamps with timezone (`timestamptz`).
-   Store UTC timestamps; convert to local display time in the frontend.
-   Validate deal start/end ordering.
-   Do not compare date strings in application logic.

## 8. Deferred design decisions

-   Exact provider fields and uniqueness guarantees for PayHere callback
    deduplication.
