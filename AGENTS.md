# Repository Instructions

## Project context and source of truth
This is the Flash Deal / Order Processing Platform. Read `README.md` and relevant documents in `docs/` before making changes:
- `docs/01-product-requirements.md` — scope and business rules
- `docs/02-system-architecture.md` — services and communication
- `docs/03-domain-and-database-design.md` — data ownership and invariants
- `docs/04-api-contracts.md` — REST API conventions
- `docs/05-event-contracts.md` — RabbitMQ contracts
- `docs/06-workflows-and-failure-handling.md` — state transitions and failures
- `docs/07-development-roadmap.md` — implementation phases
- `docs/08-ai-development-instructions.md` — detailed AI workflow

If code and specifications conflict, report the conflict. Do not silently invent or change business rules.

## Stack and boundaries
- NestJS + TypeScript; Next.js App Router + TypeScript.
- PostgreSQL + Prisma; RabbitMQ; Redis; PayHere Sandbox.
- Initial services: API Gateway, Order Service, Notification Service.
- Order Service owns deals, inventory, orders, payment attempts, reservations, and outbox.
- Notification Service owns notification records and delivery state.
- Never access another service's database directly.
- Do not add services or infrastructure without a documented reason and approval.

## Correctness requirements
- Prevent overselling using PostgreSQL transactions and conditional atomic updates/locking.
- Redis/cache is not the source of truth for inventory.
- Preserve `availableStock + reservedStock + soldStock = totalStock` or an explicitly approved equivalent.
- Reservation transitions must be conditional and idempotent; never release stock twice.
- Snapshot deal title and price on order creation.
- Never mark an order paid from a browser redirect.
- Verify PayHere server notifications using current official documentation; never invent provider fields, hashes, or endpoints.
- Deduplicate payment callbacks.
- Explicitly handle reservation-expiry vs late-payment races; never silently discard verified payment or oversell.
- Use a transactional outbox. Assume RabbitMQ at-least-once delivery; consumers must be idempotent.
- Use bounded retries and a dead-letter queue. Do not claim exactly-once delivery.

## Engineering standards
- Strict TypeScript; avoid `any`.
- Keep controllers thin; put business logic in application/domain services.
- Validate external input at boundaries.
- Enforce authentication, roles, and resource ownership server-side.
- Use decimal-safe money and timezone-aware timestamps; persist UTC.
- Use Prisma migrations; do not use schema push for shared/staging/production.
- Keep secrets out of source control, browser bundles, and logs.
- Add database constraints for uniqueness and critical invariants where practical.
- Do not add Kafka, Kubernetes, MongoDB, GraphQL, Lambda, or extra payment providers unless approved.
- Frontend: use React Query for server state where appropriate; handle loading, empty, error, pending, and expired states.

## Workflow
1. Read relevant specifications and inspect existing code.
2. Identify impacted services, contracts, migrations, and tests.
3. State a short plan before substantial changes.
4. Implement the smallest coherent change; avoid unrelated refactors.
5. Add/update unit, integration, and concurrency tests.
6. Run relevant lint, typecheck, tests, and builds when available.
7. Report changed files, commands actually run, results, assumptions, and risks.
8. If a business-critical rule is unresolved, stop and ask rather than guessing.

## Essential test cases
Test concurrent purchases for the final stock; quantity exceeding stock; duplicate reservation release; duplicate PayHere callbacks; duplicate RabbitMQ events; payment/expiry races; invalid callback verification and amount/currency/reference mismatches; customer ownership; admin-only access.
