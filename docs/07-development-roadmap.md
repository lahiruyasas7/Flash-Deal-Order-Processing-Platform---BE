# 07 --- Development Roadmap

## Working principle

Complete one vertical slice at a time. Keep the application runnable and
tested after each phase. Do not ask coding agents to generate the entire
system in one prompt.

## Phase 0 --- Specification approval

-   Review product requirements and open decisions.
-   Confirm service boundaries.
-   Confirm order/payment/reservation state machines.
-   Confirm PayHere integration mode and callback verification
    requirements.
-   Confirmed MVP decisions are recorded: 15-minute reservation TTL,
    one-deal-line orders, 2-unit per-customer/deal limit, provisioned
    admins, manual late-payment reconciliation, and rotating refresh
    sessions.
-   Defer application implementation until official PayHere checkout and
    callback details are reviewed.
-   Confirm API and event naming.
-   Record decisions in an Architecture Decision Record (ADR) when a
    meaningful trade-off is made.

Exit criteria: requirements and architecture are approved.

## Phase 1 --- Repository and local infrastructure

-   Create monorepo or clearly organized multi-repository structure
    (choose one and document why).
-   Add Docker Compose for PostgreSQL, RabbitMQ, and Redis.
-   Add environment variable examples without real secrets.
-   Add linting, formatting, TypeScript configuration, and CI baseline.
-   Add health checks and structured logging.

Exit criteria: a developer can start dependencies and run service health
checks using documented commands.

## Phase 2 --- Authentication and gateway

-   Implement customer registration/login.
-   Provision admin user securely.
-   Implement JWT and refresh-session policy.
-   Add hashed, rotating refresh credentials and reuse detection.
-   Implement revocation of one session, family, or all user sessions.
-   Implement gateway routing and role checks.
-   Add authorization/ownership tests.

Exit criteria: protected routes and role restrictions work.

## Phase 3 --- Deal management

-   Implement deal schema and migrations.
-   Implement admin deal CRUD/lifecycle.
-   Implement public active-deal listing/details.
-   Implement and test confirmed lifecycle transitions and immutable
    post-activation price/stock fields.
-   Add DTO validation and pagination.

Exit criteria: admin can manage deals and customers can browse eligible
deals.

## Phase 4 --- Inventory and order creation

-   Implement atomic stock reservation.
-   Create order and immutable item snapshots transactionally.
-   Add idempotency key handling.
-   Enforce the 2-unit paid-plus-active-reservation limit in PostgreSQL
    transactions; do not use Redis for this decision.
-   Implement order listing/details and ownership checks.
-   Add concurrency tests.

Exit criteria: stock cannot be oversold under tested concurrent
requests.

## Phase 5 --- Reservation expiry

-   Implement expiry worker.
-   Make worker safe under multiple instances.
-   Test duplicate execution and payment/expiry race.
-   Implement conditional customer/admin cancellation.

Exit criteria: reservations release once and counters remain consistent.

## Phase 6 --- PayHere Sandbox

-   Confirm exact PayHere product/mode and current official callback
    requirements.
-   Implement payment attempt creation.
-   Implement checkout redirect/form.
-   Implement verified server notification endpoint.
-   Implement provider notification idempotency.
-   Implement payment/order state transitions and late-payment
    reconciliation.
-   Add the reconciliation record and admin resolution workflow.
-   Do not implement invented callback fields or a provider assumption;
    official PayHere documentation is an implementation dependency.
-   Test invalid, duplicate, delayed, and mismatched callbacks.

Exit criteria: sandbox payment success/failure changes state correctly
and safely.

## Phase 7 --- Outbox and Notification Service

-   Add outbox publisher.
-   Configure RabbitMQ exchange, queues, retries, and DLQ.
-   Implement notification consumer and idempotency.
-   Persist event/notification processing before acknowledgment.
-   Configure bounded retries, durable retry/DLQ routing, and duplicate
    delivery tests.
-   Add email templates and SMTP sandbox.
-   Test broker outage and duplicate event delivery.

Exit criteria: committed business events are eventually delivered and
email side effects are deduplicated as far as the provider allows.

## Phase 8 --- Next.js frontend

-   Authentication pages.
-   Deal listing/details.
-   Checkout/payment status experience.
-   Customer order history/details.
-   Admin deal management.
-   Admin order list.
-   Handle pending states and eventual consistency clearly.

Exit criteria: end-to-end user flow works from browser to PayHere
Sandbox and back to verified order status.

## Phase 9 --- Invoice and hardening

-   Generate invoice PDF for paid orders.
-   Add rate limits and security review.
-   Add integration/e2e tests.
-   Add monitoring and operational dashboards.
-   Document backup, migration, and deployment procedures.

Exit criteria: release checklist passes.

## Phase 10 --- Deployment

-   Select AWS deployment approach based on budget and learning
    objectives.
-   Add CI/CD.
-   Configure secrets, TLS, database backups, logs, metrics, and alerts.
-   Run staging smoke tests before production.

Do not introduce Kubernetes as a default learning requirement.

## Definition of done for a feature

-   Business rules are documented.
-   DTO validation and authorization are implemented.
-   Database constraints and migration are included.
-   Failure and retry behavior is considered.
-   Unit/integration tests are added.
-   API/event documentation is updated.
-   Logs contain useful correlation identifiers but no secrets.
-   Code is linted, formatted, and type-safe.
-   README/local run instructions remain accurate.
