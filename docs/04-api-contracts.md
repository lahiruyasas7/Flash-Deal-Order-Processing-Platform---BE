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

  GET               `/admin/deals`                    ADMIN             Admin deal listing
  ----------------------------------------------------------------------------------------

Do not allow stock or price edits to invalidate existing reservations or
order snapshots. Define allowed updates by deal lifecycle.

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
  -------------------------------------------------------------------------------------------

The callback endpoint is not a browser-authenticated customer endpoint.
It must verify the provider notification using PayHere's documented
mechanism and correlate the notification to a known payment attempt.

## 5. Example create-order request

``` json
{
  "dealId": "d6a5c0e0-0000-4000-8000-000000000001",
  "quantity": 1
}
```

The customer identity comes from the authenticated principal, not a
client-supplied `userId`.

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
-   Consider an idempotency key for order creation to protect against
    client retries/double clicks.
-   Do not use a user-provided amount as the payment amount. Calculate
    from the stored order snapshot.
-   Payment callbacks must be idempotent and auditable.
-   Add OpenAPI/Swagger documentation.
