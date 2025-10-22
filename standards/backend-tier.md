# Backend Tier

## Edge & Interface Layer

**Framework**

* **NestJS** (DI, modules).
* **@nestjs/terminus** for health; **@nestjs/config**; **Zod** schemas shared from `shared/contracts` (class-validator usage requires exception registry entry).
* Serverless bridge: **@vendia/serverless-express** or **aws-lambda-fastify** depending on router; with **Middy** for Lambda middleware.

**Patterns**

* **Controller → UseCase(Service) → Port(Adapter)**.
* **Error Taxonomy** (domain vs infra) + **filters** map to HTTP.
* **Observability interceptors** (request id, span, attributes).
* Controllers only depend on injected ports; SDK/DB clients are constructed in adapters or factories.

**Fitness gates**

* No controller invokes AWS SDK directly (depcruise rule).
* 100% DTOs validated; contract tests for every controller.
* dependency-cruiser upload verifies handler → service → adapter layering and rejects cycles.
* **Owner**: Backend Edge Lead. **Evidence**: depcruise report + contract test summary uploaded with `pnpm turbo run qa:static --parallel`.

## Lambda Application Layer

**Libraries**

* **Middy** (timeouts, input/output validation, powertools correlation).
* **AWS Powertools for TypeScript** (Logger/Metrics/Tracer).
* **aws-jwt-verify** if needed.

**Patterns**

* **Function-per-concern** with clear input/output schemas.
* **Idempotency utility** (Powertools idempotency or custom with DynamoDB).
* **DLQ + retries** tuned per handler.
* External retries use bounded exponential backoff (≤ 3 attempts) with jitter and early tracing of failures.
* Every IO edge propagates and emits `traceparent` so downstream spans stitch correctly.

**Fitness gates**

* Cold-start P50 ≤ published budget; size budgets (< 5–10 MB zipped per fn).
* Idempotency enabled on mutating handlers.
* **Owner**: Platform & Quality Lead. **Evidence**: powertools metrics export + bundle size report archived in `docs/ops/backend` per release.

## Domain Service Layer

**Libraries**

* **neverthrow** (Result/Either) for error/flow control (alternatives require ADR).
* **OneTable** for DynamoDB modeling; deviation needs documented data-strategy ADR.

**Patterns**

* **DDD-lite**: domain services with pure functions where possible.
* **State machine** (XState) definitions reside in `shared/statecharts`; both app and domain import the generated artefact to avoid drift.
* **Policy/Strategy** objects for provider selection rules.

**Fitness gates**

* Pure units (no I/O) ≥ 70% of domain code.
* State transition coverage: tests assert allowed + forbidden transitions using generated statechart fixtures.
* **Owner**: Domain Maintainer. **Evidence**: coverage trend + statechart checksum logged in evidence bundle.

## Provider Integration Layer

**Libraries**

* **cockatiel** (retry, timeout, bulkhead, circuit breaker).
* **pino** structured logging with Powertools transport.
* **opossum** optional for circuit breaker visualization (must justify via ADR).

**Patterns**

* **Strategy + Abstract Factory** for provider choice; each provider = **Adapter** implementing a **Port**.
* **Backoff jitter**; **hedged requests** for flaky providers.

**Fitness gates**

* Provider can be toggled via flag; end-to-end tests run against the **Stubbed Provider** in CI.
* External call retries/circuit breakers configured as code (no magic defaults).
* **Owner**: Integration Maintainer. **Evidence**: CI artefact logging stubbed-provider run + retry policy snapshot stored under `docs/providers`.

## Shared Backend Utilities Layer

**Libraries**

* **zod** for validation; **zod-to-ts** to emit types for consumers.
* **pino** logging helpers shared with provider layer.
* Error utilities encode **cause**, **category**, **httpMapping** and live in `backend/lambdas/shared/errors`.

**Fitness gates**

* Single `errors/` catalog with code uniqueness enforced at build.
* **Owner**: Shared Utilities Maintainer. **Evidence**: build artefact from `npm run lint:errors --prefix backend`.

## Platform & Quality Layer

**Libraries**

* **Jest** (default) or **Vitest** (ADR-backed exception); **supertest**; **pact** for consumer contracts.
* **k6** or **Artillery** for load; **powertools metrics** to CloudWatch/XRay.
* **localstack** for integration (with explicit fallbacks where CE lacks features).

**Fitness gates**

* Mutation score ≥ 60% now → 80% later; unit ≥ 80% line coverage; integration ≥ 60%.
* Pact broker check in CI; breaking changes hard-fail.
* Function complexity budgets: handlers fail above CC 10 or 75 LOC, services/adapters fail above CC 15 or 200 LOC, and module cyclomatic complexity fails above 50.
* **Owner**: Quality Guild. **Evidence**: attach mutation dashboard export and pact verification log to the evidence bundle.

## Change Management

* **Upgrade cadence**: review core backend dependencies quarterly; record outcomes in `tasks/` and link supporting ADRs.
* **Exception handling**: any divergence from mandated libraries or patterns must cite the exception registry with expiry ≤ 90 days.
* **Review checklist**: during code reviews, verify the corresponding evidence artefact was generated for the touched layer before approval.
