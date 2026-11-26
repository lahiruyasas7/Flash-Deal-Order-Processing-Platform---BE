# 01 --- Product Requirements

## 1. Product overview

The Flash Deal Platform is an e-commerce application for time-limited
deals with limited stock. An administrator creates and manages deals.
Customers browse active deals and place orders. The backend reserves
inventory safely, initiates PayHere Sandbox checkout, verifies payment
notifications, and confirms or expires orders.

The central engineering objective is correctness under concurrency and
unreliable distributed communication.

## 2. User roles

### Administrator

-   Sign in securely.
-   Create, edit, publish, schedule, and end deals.
-   View deals and their inventory counters.
-   View orders and payment statuses.

### Customer

-   Register and sign in.
-   Browse active deals.
-   View deal details and remaining stock.
-   Place an order.
-   Complete payment through PayHere Sandbox.
-   View order history and order details.
-   Access an invoice for a successfully paid order (PDF generation may
    be implemented after the core payment flow).

## 3. MVP features

### Authentication and authorization

-   Customer registration and login.
-   Administrator login / provisioned admin account.
-   JWT-based authentication.
-   Role-based authorization (`ADMIN`, `CUSTOMER`).
-   Passwords stored using a secure password hashing algorithm.
-   Access tokens are short-lived.
-   Refresh tokens are rotating, revocable, and stored only as hashes.
-   Refresh-session reuse is detected and revoked.
-   Logout revokes the presented refresh session.

### Deal management

-   Admin can create and update deals.
-   A deal has a title, description, original price, deal price, stock
    quantity, start time, end time, and status.
-   Customers can only purchase a deal while it is active and within its
    configured time window.
-   Deal price and relevant product/deal details are snapshotted onto an
    order at purchase time.

### Deal discovery

-   Customers can list currently active deals.
-   Customers can view deal details.
-   Remaining stock is displayed as informational data; it is not a
    guarantee that stock will still be available at checkout.

### Orders and inventory

-   Customer can create an order for a deal and quantity.
-   Inventory reservation must be atomic and concurrency-safe.
-   Order creation and inventory reservation must be consistent.
-   An order begins in `PENDING_PAYMENT`.
-   A reservation expires 15 minutes after order creation (confirmed
    MVP default).
-   A reservation can be released only once.
-   A successful verified payment must not be lost merely because a
    timeout worker races with the payment notification; late-payment
    handling must be explicit.
-   A customer is limited to 2 units across paid purchases and active
    reservations for one deal.

### Payments

-   Integrate PayHere Sandbox.
-   Create a payment attempt for an order.
-   Redirect the customer to PayHere checkout using the provider's
    supported flow.
-   Handle the server-to-server payment notification.
-   Verify the notification according to PayHere's current integration
    specification and merchant configuration.
-   Do not trust the browser return URL as proof of payment.
-   Process duplicate notifications idempotently.
-   Do not confirm an order unless a successful payment has been
    verified.

### Notifications

-   Notification Service consumes order/payment events from RabbitMQ.
-   Send email for relevant order/payment outcomes.
-   Store notification status/history in the Notification Service
    database.
-   Initial email provider: Mailtrap or another SMTP testing provider.

### Invoices

-   Generate or expose an invoice PDF for a paid order.
-   This is a secondary MVP feature and should be implemented after the
    order/payment lifecycle is reliable.
-   Invoice values must come from the immutable order snapshot, not the
    current deal record.

## 4. Core business rules

1.  A deal cannot be purchased before its start time or at/after its end
    time.
2.  A deal cannot accept new orders unless it is in a purchasable
    status.
3.  Requested quantity must be a positive integer. A customer may hold
    at most 2 units across paid purchases and active reservations for
    one deal. The check excludes expired, released, and cancelled
    reservations and must not double-count a paid reservation.
4.  Available stock must never become negative.
5.  Total successful sales must never exceed the deal's total stock.
6.  Order price is snapshotted when the order is created.
7.  A pending order is not a confirmed order.
8.  Only a verified successful PayHere notification can cause payment
    success.
9.  Reprocessing the same provider notification must not create another
    payment or order transition.
10. A reservation must not be released more than once.
11. An order must not be confirmed twice.
12. Notification delivery is asynchronous and may be delayed; it must
    not determine whether an order is paid.
13. Service database ownership must be respected. No service directly
    reads or writes another service's tables.

## 5. Confirmed status models

### Deal

-   `DRAFT`
-   `SCHEDULED`
-   `ACTIVE`
-   `ENDED`
-   `CANCELLED`

Deal status is the lifecycle authority. Scheduled activation and ending
are performed by a worker. Public deal listing uses only
`status = ACTIVE` and a valid current time window.

The confirmed lifecycle is:

- `DRAFT` -> `SCHEDULED` or `ACTIVE`
- `SCHEDULED` -> `ACTIVE` (scheduled worker or administrator early
  activation) or `CANCELLED`
- `ACTIVE` -> `ENDED` or `CANCELLED`
- `ENDED` and `CANCELLED` are terminal

Editing rules:

- `DRAFT`: all deal fields may be edited.
- `SCHEDULED`: all deal fields may be edited subject to validation.
- `ACTIVE`: descriptive fields only; price and inventory fields are
  immutable.
- `ENDED`: business fields are immutable.
- `CANCELLED`: business fields are immutable.

Admins cannot create or update to a date range whose end is at or before
its start.

### Order

-   `PENDING_PAYMENT`
-   `PAID`
-   `RECONCILIATION_REQUIRED`
-   `EXPIRED`
-   `CANCELLED`

`PAYMENT_FAILED` is not an order status. A provider failure applies only
to the individual payment attempt and leaves the order
`PENDING_PAYMENT` while the reservation remains active.

`RECONCILIATION_REQUIRED` means a provider-verified success could not be
settled against a valid active reservation. The reservation remains in
its existing terminal state and no stock is restored or oversold.

`CANCELLED` means the customer or an administrator cancelled before
payment success and the active reservation was released. The same
reservation cannot be released twice.

### Payment attempt

-   `PENDING`
-   `SUCCESS`
-   `FAILED`
-   `CANCELLED`
-   `EXPIRED`

An order may have multiple payment attempts, but at most one successful
payment may settle the order.

Payment attempt transitions are defined in the domain and workflow
documents.

### Reservation

-   `ACTIVE`
-   `COMMITTED`
-   `RELEASED`
-   `EXPIRED`

## 6. Out of scope

-   Shopping cart and multi-deal checkout
-   Coupons and promotions beyond the deal price
-   Shipping and delivery tracking
-   Product reviews and ratings
-   Multiple sellers/vendors
-   Multiple payment gateways
-   Automated refunds and chargebacks
-   Mobile applications
-   Kubernetes
-   Advanced analytics and recommendation systems

## 7. Acceptance criteria

### Deal management

-   Admin-only endpoints reject customer access.
-   Invalid price, stock, and date ranges are rejected.
-   Customers cannot purchase scheduled, ended, cancelled, or draft
    deals.

### Inventory concurrency

-   Given stock of 10 and many concurrent requests, successful
    reservations never exceed 10 units.
-   Rejected requests do not decrement stock.
-   Releasing one reservation twice does not increase available stock
    twice.

### Payment

-   Browser redirect alone cannot mark an order paid.
-   A valid success notification marks the payment attempt successful
    and order paid exactly once.
-   Duplicate notifications do not duplicate state transitions or side
    effects.
-   A failed or expired payment releases stock according to the defined
    state machine.
-   Late success after reservation expiry follows a documented
    reconciliation path.

### Messaging

-   Events are published only after the relevant database transaction
    commits.
-   Consumers safely handle duplicate deliveries.
-   Failed messages are retried with bounded attempts and eventually
    routed to a dead-letter queue.

## 8. Confirmed decisions and deferred decisions

Confirmed MVP decisions:

- Reservation TTL: 15 minutes.
- Order shape: one deal line per order.
- Per-customer limit: maximum 2 units for each customer/deal pair.
  Count paid purchases and active reservations; do not double-count a
  paid reservation.
- Admin accounts: seeded/provisioned only; public admin registration is
  out of scope.
- Late verified success after reservation expiry: create a reconciliation
  record for manual review/refund handling and never automatically
  oversell.
- Authentication: short-lived access tokens, rotating refresh tokens,
  and revocable refresh sessions.

Deferred implementation decisions:

- Exact refresh access-token lifetime and refresh-token lifetime.
- Exact PayHere checkout mode and all merchant/configuration fields.
- The official callback verification method and stable notification key.
- Whether PDF invoice generation is included in the first release or
  added immediately after payment lifecycle hardening.
