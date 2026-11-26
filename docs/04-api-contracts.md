# 04 --- Initial API Contracts

These routes are a proposed baseline. Confirm naming and response
envelopes before implementation. All public routes are versioned under
`/api/v1`.

## 1. Conventions

-   JSON request/response bodies.
-   UUIDs for internal resource identifiers.
-   ISO-8601 timestamps with timezone.
-   Decimal money values serialized as strings to avoid floating-point
    ambiguity.
-   Consistent error response:

``` json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

-   List response:

``` json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 0,
    "totalPages": 0
  }
}
```

-   Never expose internal stack traces or secrets.
-   Customer resource access must enforce ownership on the server.

## 2. Authentication

  Method   Route              Access               Purpose
  -------- ------------------ -------------------- ------------------------
  POST     `/auth/register`   Public               Register customer
  POST     `/auth/login`      Public               Login
  POST     `/auth/refresh`    Refresh credential   Rotate/refresh tokens
  POST     `/auth/logout`     Authenticated        Revoke refresh session

Admin creation should be provisioned/seeded initially, not open public
registration.

Refresh sessions use opaque rotating refresh credentials. The refresh
endpoint accepts the refresh credential and returns a new short-lived
access token plus a newly rotated refresh credential. The previous
refresh credential becomes unusable.

Reuse of an already rotated or revoked refresh credential must revoke the
entire active refresh-session family. Logout revokes the presented
session and refresh credential.

Refresh credentials are transported in an `HttpOnly`, `Secure` cookie
with appropriately configured `SameSite` and path settings. Browser
JavaScript cannot read or set the refresh token. CSRF protection must be
implemented appropriate to the selected `SameSite` policy and
credentials mode, with origin validation and/or an anti-CSRF mechanism
for cookie-authenticated state-changing endpoints.

Login/refresh returns the access token in the JSON response. Logout
clears the refresh cookie and revokes the server-side refresh session.
Revoking refresh sessions does not immediately invalidate existing
stateless access tokens; access tokens should expire in 15 minutes
(proposed). The refresh-token lifetime is deferred for confirmation.

## 3. Deals

  ----------------------------------------------------------------------------------------
  Method            Route                             Access            Purpose
  ----------------- --------------------------------- ----------------- ------------------
  GET               `/deals`                          Public            List active deals

  GET               `/deals/:dealId`                  Public            Deal details

  POST              `/admin/deals`                    ADMIN             Create deal

  PATCH             `/admin/deals/:dealId`            ADMIN             Update allowed
                                                                        fields

  POST              `/admin/deals/:dealId/activate`   ADMIN             Activate/publish
                                                                        deal

  POST              `/admin/deals/:dealId/end`        ADMIN             End deal

    POST              `/admin/deals/:dealId/cancel`     ADMIN             Cancel deal

  GET               `/admin/deals`                    ADMIN             Admin deal listing
  ----------------------------------------------------------------------------------------

  The lifecycle rules are:

  - `DRAFT`: all deal fields may be updated or cancelled.
  - `SCHEDULED`: all deal fields may be updated, subject to validation;
    it may be activated early, ended, or cancelled.
  - `ACTIVE`: descriptive fields may be updated; price and inventory
    fields are immutable; it may be ended or cancelled.
  - `ENDED` and `CANCELLED`: business fields are immutable and lifecycle
    actions are rejected.

  Deal cancellation rejects future orders but does not release existing
  reservations or alter paid orders. Active reservations continue to their
  normal expiry or explicit order-cancellation workflow.

## 4. Orders and payment

  -------------------------------------------------------------------------------------------
  Method            Route                                 Access            Purpose
  ----------------- ------------------------------------- ----------------- -----------------
  POST              `/orders`                             CUSTOMER          Create order and
                                                                            reserve inventory

  GET               `/orders`                             CUSTOMER          List current
                                                                            customer's orders

  GET               `/orders/:orderId`                    Owner / ADMIN     Order details

  POST              `/orders/:orderId/payment-attempts`   Owner             Start a payment
                                                                            attempt

  GET               `/orders/:orderId/payment-status`     Owner / ADMIN     Read current
                                                                            payment/order
                                                                            status

  POST              `/payments/payhere/notify`            PayHere server    Receive and
                                                          callback          verify provider
                                                                            notification
  POST              `/orders/:orderId/cancel`             Owner / ADMIN     Cancel pending
                                                                            payment and
                                                                            release reservation
  GET               `/admin/reconciliations`              ADMIN             List late-payment
                                                                            review records
  PATCH             `/admin/reconciliations/:id`          ADMIN             Resolve reviewed
                                                                            reconciliation
  -------------------------------------------------------------------------------------------

The callback endpoint is not a browser-authenticated customer endpoint.
It must verify the provider notification using PayHere's documented
mechanism and correlate the notification to a known payment attempt.

`POST /orders/:orderId/payment-attempts` creates a payment attempt only
after this request. It does not create or modify the order reservation.
If the order is `PENDING_PAYMENT`, the reservation is `ACTIVE`, and no
payment attempt is already `PENDING`, the endpoint creates one
`PENDING` attempt and returns its checkout payload. Repeating the request
before a provider response returns the existing `PENDING` attempt rather
than creating another. Concurrent requests enforce the database partial
unique index on `PENDING` attempts. Terminal attempts remain in history.

## 5. Example create-order request

``` json
{
  "dealId": "d6a5c0e0-0000-4000-8000-000000000001",
  "quantity": 1
}
```

The customer identity comes from the authenticated principal, not a
client-supplied `userId`.

Order creation requires an `Idempotency-Key` header. The key is scoped
to `(authenticated user, CREATE_ORDER)`. Repeating the same key with the
same request hash returns the original order result. Repeating the key
with a different request body returns `409 Conflict`; different keys
remain independent requests and still execute stock and customer-limit
checks.

`POST /orders` creates only the order, item snapshot, inventory
reservation, and idempotency record. It does not create a payment
attempt. Payment attempts are created by the separate payment-attempt
endpoint.

## 6. Example create-order response

``` json
{
  "data": {
    "orderId": "c4d3f2a1-0000-4000-8000-000000000001",
    "orderNumber": "FD-2026-000001",
    "status": "PENDING_PAYMENT",
    "total": "12500.00",
    "currency": "LKR",
    "reservationExpiresAt": "2026-11-25T14:30:00.000Z"
  }
}
```

## 7. Example payment-attempt response

``` json
{
  "data": {
    "paymentAttemptId": "a1b2c3d4-0000-4000-8000-000000000001",
    "provider": "PAYHERE",
    "status": "PENDING",
    "checkout": {
      "method": "POST",
      "url": "PAYHERE_SANDBOX_CHECKOUT_URL",
      "fields": {}
    }
  }
}
```

`checkout.fields` must be built from PayHere's current official
integration requirements. Do not hardcode example credentials or invent
provider fields in the application.

## 8. API behavior requirements

-   Use DTO validation at the boundary.
-   Reject unknown or invalid fields where appropriate.
-   Add pagination to list endpoints.
-   Use a stable error format.
-   Require `Idempotency-Key` for order creation and enforce the
    `(userId, operation, key)` uniqueness rule in the database.
-   Do not use a user-provided amount as the payment amount. Calculate
    from the stored order snapshot.
-   Payment callbacks must be idempotent and auditable.
-   Add OpenAPI/Swagger documentation.
-   Customer cancellation is allowed only for `PENDING_PAYMENT` and an
    `ACTIVE` reservation; it releases the reservation once and cancels
    pending attempts.
-   Admin reconciliation endpoints are admin-only. A resolution must
    include a documented status and sanitized audit notes. Resolution
    status values are `REFUND_APPROVED`, `REFUND_COMPLETED`, and
    `CLOSED_NO_ACTION`; no reconciliation resolution may create stock or
    directly mark an order paid.

## 9. PayHere integration details deferred until official review

No PayHere field, hash formula, endpoint, or acknowledgement behavior
is considered finalized until the implementation is checked against the
current official PayHere documentation. Before implementation, the team
must verify and document:

- supported checkout mode and exact server-notification field names;
- canonical callback verification/signature procedure;
- stable provider notification identifier and whether it is guaranteed
  unique;
- provider-specific success and failure status values;
- callback amount, currency, and merchant/order-reference fields;
- callback acknowledgement response and HTTP status;
- sandbox merchant, currency, redirect, and server-notification
  configuration;
- handling of missing or mismatched fields and duplicate delivery.

The specifications deliberately do not invent these values.
