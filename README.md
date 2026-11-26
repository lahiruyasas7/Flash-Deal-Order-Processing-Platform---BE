# Flash Deal / Order Processing Platform

A learning-focused, production-minded microservices project built with
NestJS, PostgreSQL, Prisma, RabbitMQ, Redis, and Next.js.

## Documentation index

  ----------------------------------------------------------------------------
  Document                                 Purpose
  ---------------------------------------- -----------------------------------
  `01-product-requirements.md`             Product scope, actors, features,
                                           business rules, acceptance criteria

  `02-system-architecture.md`              Services, boundaries,
                                           infrastructure, communication
                                           patterns

  `03-domain-and-database-design.md`       Entities, ownership, relationships,
                                           invariants, indexes

  `04-api-contracts.md`                    Initial REST API surface and
                                           request/response conventions

  `05-event-contracts.md`                  RabbitMQ events, delivery
                                           guarantees, idempotency

  `06-workflows-and-failure-handling.md`   Order/payment/reservation workflows
                                           and failure scenarios

  `07-development-roadmap.md`              Implementation phases, testing,
                                           definition of done

  `08-ai-development-instructions.md`      Instructions for Claude Code and
                                           Codex
  ----------------------------------------------------------------------------

## Project goal

Build a flash-sale platform where administrators publish limited-time
deals and customers place orders. The system must safely handle
concurrent purchases, reserve limited stock, integrate with PayHere
Sandbox, and process payment outcomes reliably.

## Important status

This pack is a baseline specification based on the decisions discussed
so far. Items marked **Proposed** are recommended defaults, not
confirmed external requirements. Review and approve them before
implementation.

## Confirmed MVP decisions

- Reservation expiry: 15 minutes.
- Order shape: one deal line per order.
- Per-customer limit: maximum 2 units per customer/deal pair. The count
  includes paid purchases and active reservations and never double-counts
  a paid reservation.
- Administrator accounts: seeded/provisioned only.
- Late verified payment after expiry: manual reconciliation/refund
  review; no automatic oversell or re-reservation.
- Authentication: short-lived access tokens with rotating refresh tokens
  and revocable sessions.

Provider-specific PayHere checkout and callback fields remain deferred
until implementation is verified against the current official PayHere
documentation. The specifications do not invent provider behavior.

## Core technical decisions

-   Backend: NestJS + TypeScript
-   Frontend: Next.js + TypeScript + Tailwind CSS
-   Primary database: PostgreSQL + Prisma
-   Messaging: RabbitMQ
-   Cache / rate limiting / short-lived coordination: Redis
-   Payment: PayHere Sandbox
-   Email testing: Mailtrap (or another SMTP sandbox)
-   Local infrastructure: Docker Compose
-   Testing: Jest for unit tests; Supertest for API-level tests as public
    routes are implemented
-   Initial deployment: local development first; cloud deployment later
-   API documentation: NestJS Swagger/OpenAPI

## Architecture principle

Start with a small number of services and clear ownership. Do not split
every domain into a microservice just to increase service count. The
initial proposal is: 1. API Gateway 2. Order Service (includes deal,
inventory, order, and payment modules) 3. Notification Service

The API Gateway is an edge/API composition layer, not the owner of
business data. The Order Service owns its PostgreSQL data. The
Notification Service owns its notification data. A single local
PostgreSQL server may host separate databases initially, but services
must not query another service's tables directly.

The backend services live in this npm-workspaces repository. The Next.js
frontend is maintained in a separate repository.

## Local development

Requirements: Node.js 22.22.3 or later in the 22.x line (or 24.15.0 or
later in the 24.x line), npm 10+, and Docker Compose v2.

1. Copy `.env.example` to `.env`. These values are for local development
   only; never use them in a shared or deployed environment.
2. Install dependencies with `npm ci`.
3. Start local dependencies with `docker compose up -d`.
4. Run checks with `npm run verify`.
5. Start an individual NestJS app. In PowerShell:

   ```powershell
   $env:PORT = "3000"; npm run start:dev --workspace @flash-deal/api-gateway
   $env:PORT = "3001"; npm run start:dev --workspace @flash-deal/order-service
   $env:PORT = "3002"; npm run start:dev --workspace @flash-deal/notification-service
   ```

   Run one service command per terminal.

The apps expose `GET /health/live` and `GET /health/ready` on their
configured port. At this foundation stage, readiness confirms the app
process is running; dependency-specific readiness is added alongside
database and broker integration. PostgreSQL, RabbitMQ, and Redis have
their own Docker health checks. RabbitMQ's development management UI is
available at `http://localhost:15672`.

Stop local dependencies with `docker compose down`. To preserve local
database state, do not remove the Compose volumes.

## Non-goals for the MVP

Shopping carts, coupons, reviews, shipping, multiple vendors, multiple
payment providers, automated refunds, mobile apps, Kubernetes, and
advanced analytics are out of scope.
