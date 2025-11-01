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
* **Owner**: Backend Edge Lead. **Evidence**: depcruise report + contract test summary uploaded (see commands in `standards/qa-commands-ssot.md`).

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

* Performance and size budgets per `standards/cross-cutting.md`.
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

**Purity & Immutability in Services**

Services should maximize pure domain logic and isolate I/O to injected ports/adapters:

*Pure service methods:*
- Validation logic, business rules, state transitions, DTO transformations
- Example: `validateJobInput(input: JobInput): Result<ValidJob, ValidationError>` — pure function with no I/O
- Use neverthrow `.map()` / `.andThen()` chains with pure callbacks to compose domain logic
- Policy/Strategy selection functions should be pure predicates: `selectProvider(job: Job): ProviderType`

*Impure service methods (orchestration):*
- Methods calling OneTable CRUD, invoking adapters, logging, or triggering external events
- Example: `async processJob(jobId: string): ResultAsync<Job, ProcessingError>` — orchestrates I/O via ports
- Keep orchestration minimal: validate → fetch → transform (pure) → save → notify
- Inject all I/O dependencies (OneTable client, adapters, logger) via constructor or method parameters

*Measuring the ≥70% pure threshold:*
- Count lines in domain service files (services/, use-cases/) excluding imports/types
- Pure code: validation functions, transformers, Result chains with pure callbacks, policy logic
- Impure code: OneTable calls, adapter invocations, logger statements, Date.now()
- Ratio = pure lines / total domain lines; aim for ≥0.70
- Document impure boundaries: mark orchestration methods with `// Orchestrates I/O` comments

*OneTable immutability patterns:*
- Treat fetched entities as immutable snapshots; never mutate in-place
- Updates: create new entity object via spread, then `.update()` with new object
- Example: `const updated = { ...job, status: 'completed' }; await table.update(updated);`
- Domain transformers operate on plain objects, not OneTable models directly

*Testing approach:*
- Pure domain logic: test with input/output assertions, no mocks
- Orchestration methods: mock ports/adapters with `jest.fn()` or test doubles
- If ≥70% of domain tests need zero mocks, the purity target is met

See `standards/typescript.md#analyzability` for core purity definitions and `docs/evidence/purity-immutability-gap-notes.md` for analysis.

**Fitness gates**

* Pure units (no I/O) ≥ 70% of domain code (measured as pure LOC / total domain LOC).
* State transition coverage: tests assert allowed + forbidden transitions using generated statechart fixtures.
* **Owner**: Domain Maintainer. **Evidence**: coverage trend + statechart checksum + purity ratio logged in evidence bundle.

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
* **SST live-dev stack** for exercising AWS resources in shared sandboxes.

**Fitness gates**

* Coverage thresholds per `standards/testing-standards.md`.
* Pact broker check in CI; breaking changes hard-fail.
* Complexity and hard‑fail budgets per `standards/cross-cutting.md`.
* **Owner**: Quality Guild. **Evidence**: attach coverage summary and pact verification log to the evidence bundle.

## Change Management

* **Upgrade cadence**: review core backend dependencies quarterly; record outcomes in `tasks/` and link supporting ADRs.
* **Exception handling**: any divergence from mandated libraries or patterns must cite the exception registry with expiry ≤ 90 days.
* **Review checklist**: during code reviews, verify the corresponding evidence artefact was generated for the touched layer before approval.
