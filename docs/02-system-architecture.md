# 02 --- System Architecture

## 1. Architecture overview

Use a small microservices architecture with clear ownership and
asynchronous messaging where it provides value.

``` mermaid
flowchart LR
    Browser[Next.js Web App] --> Gateway[API Gateway]
    Gateway --> Order[Order Service]
    Order --> OrderDB[(Order Service PostgreSQL)]
    Order --> Redis[(Redis)]
    Order --> PayHere[PayHere Sandbox]
    Order --> Outbox[(Outbox table)]
    Outbox --> Publisher[Outbox Publisher]
    Publisher --> RabbitMQ[(RabbitMQ)]
    RabbitMQ --> Notification[Notification Service]
    Notification --> NotificationDB[(Notification PostgreSQL)]
    Notification --> SMTP[Mailtrap / SMTP]
    PayHere -->|Server notification| Gateway
    Gateway --> Order
```

The diagram is conceptual. The PayHere notification endpoint may be
exposed through the gateway or a dedicated public route that forwards to
the Order Service. Ensure the callback reaches the service that owns
payment state.

## 2. Services and responsibilities

### API Gateway

Responsibilities: - Expose a consistent public HTTP API. - Validate
request shape and basic input constraints. - Authenticate requests and
enforce coarse-grained role checks. - Route requests to internal
services. - Apply rate limiting and request correlation IDs. - Expose
health/readiness endpoints as appropriate.

Do not put order, payment, or inventory business rules in the gateway.
Avoid turning it into a large business-logic service.

### Order Service

Owns: - Deal management. - Inventory reservation. - Orders and order
snapshots. - Payment attempts and PayHere integration. - Reservation
expiry. - Transactional outbox records.

This service is the source of truth for deal stock, order state, and
payment state.

### Notification Service

Owns: - Notification records and delivery status. - Email templates and
sending. - RabbitMQ consumers for relevant domain events.

It must not query the Order Service database. Include the necessary
order/customer data in event payloads or fetch data through an explicit
internal API if truly needed. Prefer event payloads with the minimal
data required to send the notification.

## 3. Communication

### Synchronous

-   Browser → API Gateway: REST/HTTPS.
-   API Gateway → Order Service: internal HTTP initially (or NestJS
    transport if chosen consistently).
-   PayHere → public callback endpoint: HTTPS server-to-server
    notification.

### Asynchronous

-   Order Service → RabbitMQ → Notification Service.
-   Use events for side effects such as email.
-   Use a transactional outbox to avoid committing a database change
    while failing to publish its corresponding event.

## 4. Data ownership

-   Order Service owns its PostgreSQL database.
-   Notification Service owns its PostgreSQL database.
-   A single PostgreSQL container can host separate logical databases
    locally.
-   No cross-service SQL joins or direct table access.
-   Shared contracts may be maintained in a versioned shared package,
    but avoid sharing internal persistence models.

## 5. Infrastructure

Local Docker Compose services: - PostgreSQL - RabbitMQ (management UI
enabled for development) - Redis - Optional Mailpit/Mailtrap SMTP
configuration

Applications can run on the host during early development or in
containers later. Keep local infrastructure reproducible through
environment variables and documented commands.

## 6. Reliability patterns

### Transactional outbox

Within one database transaction: 1. Update business records. 2. Insert
an outbox event record. 3. Commit. 4. A publisher process reads
unpublished outbox records and publishes them to RabbitMQ. 5. Mark
records as published after broker confirmation.

A crash between publish and marking published can cause a duplicate
event. Therefore consumers must be idempotent.

### Idempotent consumers

Each event has a stable `eventId`. Consumers persist processed event IDs
or use a unique business key to prevent duplicate side effects.

### Retry and dead-letter queue

-   Retry transient failures with bounded attempts and backoff.
-   Do not retry permanent validation/business errors indefinitely.
-   Route exhausted messages to a DLQ.
-   Provide a way to inspect and replay messages safely.

### Inventory concurrency

Use PostgreSQL transactions and conditional updates as the primary
correctness mechanism. Redis is not the source of truth for inventory.
Do not introduce distributed locks as the default solution.

### Observability

For each request/event, capture: - Correlation ID - Request/trace
context - Service name - Event ID - Order ID / payment attempt ID where
appropriate - Structured error details

Do not log passwords, access tokens, PayHere secrets, or sensitive
payment data.

## 7. Security baseline

-   HTTPS outside local development.
-   Password hashing with Argon2id or bcrypt using an appropriate cost.
-   Validate all external input.
-   Enforce ownership: customers can only access their own orders.
-   Admin endpoints require admin role.
-   Verify PayHere notifications using the current provider-defined
    method.
-   Store secrets in environment configuration locally and a secrets
    manager in deployment.
-   Rate-limit login, registration, order creation, and payment-related
    endpoints.
-   Use strict CORS configuration.
-   Avoid exposing internal service ports publicly.

## 8. Deployment evolution

Phase 1: local development with Docker Compose.

Phase 2: deploy a small environment to AWS using managed or
container-based services appropriate to budget and learning goals.

Do not add Kubernetes until there is a demonstrated operational need. Do
not add Lambda, a separate analytics database, or a separate payment
microservice to the initial MVP.
