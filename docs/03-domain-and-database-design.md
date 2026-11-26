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
-   `status`
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
-   `status`
-   `subject`
-   `createdAt`
-   `sentAt` (nullable)
-   `failureReason` (sanitized)

## 3. Inventory transitions

### Reserve

Within a transaction, conditionally decrement `availableStock` and
increment `reservedStock` only when: - deal is purchasable, - deal time
window is valid, - `availableStock >= requestedQuantity`.

Create order, order item snapshot, reservation, and initial payment
attempt consistently. If any required write fails, roll back the
transaction.

### Commit after verified payment

Within one transaction: - ensure reservation is `ACTIVE`, - decrement
`reservedStock`, - increment `soldStock`, - mark reservation
`COMMITTED`, - mark payment attempt `SUCCESS`, - mark order `PAID`, -
insert outbox event.

### Release after failure/expiry

Within one transaction: - ensure reservation is still `ACTIVE`, -
decrement `reservedStock`, - increment `availableStock`, - mark
reservation `RELEASED` or `EXPIRED`, - update order state according to
the chosen transition, - insert outbox event if needed.

All transitions must be conditional and idempotent.

## 4. Concurrency approach

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

## 5. Indexes and constraints

Recommended: - Unique index on normalized user email. - Index on deal
status and time window for active-deal listing. - Check constraints for
positive stock/quantity and valid prices. - Index on orders
`(userId, createdAt)`. - Unique order number. - Index on reservations
`(status, expiresAt)` for expiry worker. - Index on payment attempts
`(orderId, initiatedAt)`. - Unique provider payment ID where provider
guarantees uniqueness. - Unique outbox event ID. - Index on unpublished
outbox records. - Unique notification `eventId` for deduplication.

Database constraints should enforce critical invariants wherever
practical; application checks alone are insufficient for
concurrency-sensitive rules.

## 6. Money and time

-   Use decimal database types for money, not floating point.
-   Choose and consistently use a currency (LKR proposed).
-   Store timestamps with timezone (`timestamptz`).
-   Store UTC timestamps; convert to local display time in the frontend.
-   Validate deal start/end ordering.
-   Do not compare date strings in application logic.

## 7. Open design decisions

-   One order with one deal line vs multi-line order (one line
    recommended initially).
-   Whether stock counters are stored on Deal or derived from
    reservations/sales (stored counters are performant but require
    strict transactional maintenance).
-   How to handle deal stock edits after reservations/sales exist.
-   Whether to keep user tables in Order Service for MVP or introduce a
    dedicated Auth Service.
-   Exact provider fields and uniqueness guarantees for PayHere callback
    deduplication.
