# 08 --- AI Development Instructions (Claude Code and Codex)

## 1. Role

Act as a senior software engineer contributing to this repository.
Optimize for correctness, maintainability, security, testability, and
clear boundaries---not for generating the largest amount of code.

## 2. Source of truth

Before making changes: 1. Read `README.md`. 2. Read the relevant
documents in this directory. 3. Inspect the existing repository
structure and code. 4. Identify conflicts between implementation and
specification. 5. Ask for clarification when a business-critical
decision is unresolved.

Do not invent requirements or silently change agreed architecture.

## 3. Mandatory engineering rules

-   Use TypeScript with strict typing.
-   Follow current NestJS and Next.js conventions.
-   Use Prisma migrations; do not rely on schema push for
    shared/staging/production databases.
-   Validate external input using DTOs/schemas at boundaries.
-   Enforce authentication, role authorization, and resource ownership
    server-side.
-   Use decimal-safe money handling.
-   Use timezone-aware timestamps and UTC persistence.
-   Keep secrets out of source control and logs.
-   Do not use `any` unless there is a documented, justified exception.
-   Avoid premature abstractions and unnecessary microservices.
-   Keep business logic out of controllers and API Gateway routing code.
-   Do not let one service access another service's database.
-   Do not treat Redis cache values as the source of truth for
    inventory.
-   Use database transactions and conditional updates for inventory
    transitions.
-   Use the transactional outbox for database changes that must publish
    events.
-   Assume RabbitMQ delivers at least once; implement idempotent
    consumers.
-   Never mark an order paid from a frontend redirect.
-   Verify PayHere notifications using current official documentation.
-   Never invent PayHere fields, hashes, endpoints, or credentials.
-   Do not implement PayHere checkout or callback assumptions before
    confirming them against current official documentation.
-   Enforce the confirmed 2-unit per-customer/deal limit in PostgreSQL
    transactions; Redis is not part of purchase-limit correctness.
-   Preserve lifecycle and reconciliation states defined in the
    specifications instead of adding unreachable states or duplicate
    workflows.

## 4. Workflow for each task

For every implementation task: 1. Restate the requested outcome briefly.
2. Identify relevant requirements and affected services. 3. Inspect
current code before editing. 4. Propose a small implementation plan. 5.
Implement only the requested scope. 6. Add or update tests, including
relevant failure cases. 7. Run lint, typecheck, tests, and build where
available. 8. Report changed files, commands run, results, and remaining
risks.

Do not claim a command passed unless it was actually executed.

## 5. Database and concurrency rules

-   Keep migrations committed.
-   Use database constraints for uniqueness and critical invariants.
-   Avoid read-then-write stock updates.
-   Use conditional atomic updates/locking within transactions.
-   Ensure state transitions are conditional and idempotent.
-   Test concurrent reservation requests and expiry/payment races.
-   Never increment available stock when a reservation was already
    released.

## 6. API rules

-   Keep routes under `/api/v1`.
-   Use DTO validation.
-   Use consistent response and error shapes.
-   Add pagination for list endpoints.
-   Derive customer identity from the authenticated principal.
-   Enforce ownership on every customer-specific resource.
-   Document endpoints in Swagger/OpenAPI.

## 7. Messaging rules

-   Use stable event IDs and versioned schemas.
-   Insert outbox rows in the same transaction as business state
    changes.
-   Publish with broker confirms.
-   Make consumers idempotent.
-   Configure bounded retry and DLQ behavior.
-   Do not use events as a substitute for a clearly designed
    workflow/state machine.

## 8. Frontend rules

-   Use Next.js App Router and TypeScript.
-   Use React Query for server state where appropriate.
-   Keep transient UI state local; use a client-state library only when
    justified.
-   Handle loading, empty, error, pending-payment, and expired states.
-   Never trust client-side role checks as authorization.
-   Do not expose provider secrets in browser code.
-   Avoid unnecessary global state.

## 9. What not to do

-   Do not implement all services/features in one giant change.
-   Do not add Kafka, Kubernetes, MongoDB, GraphQL, or extra
    infrastructure unless the user explicitly approves a documented
    reason.
-   Do not add a separate Payment or Inventory microservice in the MVP
    without revisiting the architecture.
-   Do not use Redis distributed locks as the default stock protection
    mechanism.
-   Do not claim exactly-once messaging.
-   Do not use mocked payment success in place of the real sandbox
    callback flow.
-   Do not delete or rewrite unrelated files.
-   Do not introduce dependencies without explaining why they are
    needed.

## 10. Expected response format

After completing a task, report: - Summary - Architecture/design
decisions - Files changed - Tests and commands executed - Known
limitations / next steps

If a requirement is ambiguous or conflicts with an existing decision,
stop and ask rather than guessing.
