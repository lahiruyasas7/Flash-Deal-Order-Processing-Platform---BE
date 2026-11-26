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

## Core technical decisions

-   Backend: NestJS + TypeScript
-   Frontend: Next.js + TypeScript + Tailwind CSS
-   Primary database: PostgreSQL + Prisma
-   Messaging: RabbitMQ
-   Cache / rate limiting / short-lived coordination: Redis
-   Payment: PayHere Sandbox
-   Email testing: Mailtrap (or another SMTP sandbox)
-   Local infrastructure: Docker Compose
-   Testing: Jest + Supertest
-   Initial deployment: local development first; cloud deployment later

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

## Non-goals for the MVP

Shopping carts, coupons, reviews, shipping, multiple vendors, multiple
payment providers, automated refunds, mobile apps, Kubernetes, and
advanced analytics are out of scope.
