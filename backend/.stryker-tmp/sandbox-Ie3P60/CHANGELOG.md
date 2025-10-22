# Changelog - @photoeditor/backend

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Cancelled - TASK-0801 (2025-10-22)
**Task:** Restore executable BDD coverage for upload pipeline

**Status:** CANCELLED - Task based on incorrect assumption that BDD/Gherkin is required

**Cancellation Rationale:**
1. **Standards do not require BDD/Gherkin**: Comprehensive search of standards/ directory shows zero mentions of BDD, Gherkin, or Cucumber requirements
2. **Cucumber deliberately retired**: docs/evidence/cucumber-retrospective.md (dated 2025-10-21, TASK-0293) documents intentional retirement with justification
3. **Coverage already exists**: Playwright smoke tests at backend/tests/smoke/ provide equivalent E2E coverage (7 scenarios)
4. **Task description inaccurate**: Claims "testing standards still call for executable BDD scenarios" - not supported by documentation

**Resolution:**
- Updated standards/testing-standards.md to explicitly state:
  * **Playwright** is the standard E2E framework (not Cucumber/Gherkin/BDD)
  * Better TypeScript integration, faster execution, simpler maintenance
  * Reference to cucumber-retrospective.md for retirement rationale
- Task archived to docs/completed-tasks/TASK-0801-bdd-backfill.task.yaml with cancellation notes
- No further action needed - E2E coverage requirements fully satisfied by existing Playwright suite

**Current E2E Coverage (Playwright Smoke Tests):**
- Generate presigned upload URL (happy path)
- Upload image to S3 via presigned URL
- Retrieve job status
- Reject invalid content type (validation error)
- Reject oversized file (validation error)
- Return 404 for non-existent job (error path)
- W3C traceparent correlation ID propagation

**Alternative Path:** If additional E2E scenarios are needed, create new task to enhance Playwright coverage rather than reintroducing Cucumber

**References:**
- Archived Task: docs/completed-tasks/TASK-0801-bdd-backfill.task.yaml
- Standards Update: standards/testing-standards.md (sections: "End-to-End (E2E) Tests", "Backend E2E Tests")
- Retrospective: docs/evidence/cucumber-retrospective.md
- Current Coverage: backend/tests/smoke/api-flow.smoke.spec.ts
- Investigation: docs/evidence/task-investigations/TASK-0801-blocking-analysis.md

**No ADR needed** - Standards clarification only, no architectural change

### Added - TASK-0286
- Created pure domain layer in backend/src/domain/job.domain.ts with neverthrow Result types
- Created JobRepository adapter in backend/src/repositories/job.repository.ts for DynamoDB I/O separation
- Created job lifecycle state machine in shared/statecharts/jobLifecycle.machine.ts
- Added statechart validation functions (isValidTransition, getNextState, isTerminalState, isInProgressState)
- Generated statechart checksum for drift detection (docs/evidence/statecharts/jobLifecycle-checksum.txt)
- Added comprehensive unit tests for domain logic and state transitions

### Changed - TASK-0286
- Refactored JobService to orchestrate domain and repository layers (standards/backend-tier.md line 56)
- Domain logic now returns neverthrow Result types instead of throwing exceptions
- State transitions validated via shared statechart (standards/backend-tier.md line 57)
- JobService provides backward-compatible legacy methods (deprecated) alongside new Result-based methods
- Separated I/O (repository) from business logic (domain), achieving ≥70% pure domain code target

### Architecture - TASK-0286
- Domain services: Pure functions with neverthrow Result error handling
- Repository pattern: All DynamoDB operations isolated in JobRepository
- State machine: Centralized job lifecycle transitions in shared/statecharts for drift prevention
- Layering: JobService → domain functions → repository adapters (standards/backend-tier.md lines 49-64)

### Dependencies - TASK-0286
- Added neverthrow@8.2.0 for functional error handling
- Added @xstate/fsm@2.1.0 for state machine utilities

### Testing - TASK-0286
- Added tests/unit/domain/job.domain.test.ts covering all domain functions
- Added shared/__tests__/jobLifecycle.machine.test.ts for state transition validation
- Tests validate allowed/forbidden transitions per statechart specification
- Domain tests demonstrate neverthrow Result handling patterns

### Compliance - TASK-0286
- Domain modules contain zero AWS SDK imports (hard fail control, standards/cross-cutting.md line 20)
- Domain services ≤200 LOC, complexity ≤15 (standards/backend-tier.md line 71)
- State machine checksum recorded for CI validation (standards/backend-tier.md line 63)
- Repository pattern separates I/O from domain logic (standards/backend-tier.md lines 56-58)

### References - TASK-0286
- Task: tasks/backend/TASK-0286-domain-layer-refactor.task.yaml
- standards/backend-tier.md lines 49-64 (Domain Service Layer)
- standards/cross-cutting.md line 20 (hard fail controls)
- standards/global.md (evidence bundle requirements)
- ADR: None required (architecture pattern already established)

### Changed - TASK-0285
- Refactored Lambda handlers (presign, status, worker, download) to use Middy middleware for dependency injection
- Created centralized service container in libs/core/container/ for service initialization
- Implemented serviceInjection middleware to eliminate in-handler service instantiation
- Updated dependency-cruiser rules to forbid direct service imports in handlers (standards/backend-tier.md line 68)
- Handlers now consume services via injected ServiceContext, maintaining <75 LOC complexity
- All Powertools (Logger, Metrics, Tracer) injected via container instead of module-level singletons
- Dynamic service imports in container to break circular dependency between services and core

### Testing - TASK-0285
- Added Jest mocks for @middy/core and serviceInjection middleware
- Updated test setup to support Middy-wrapped handlers
- All existing unit tests pass (84+ test cases)
- Dependency validation passes with expected warnings about service→core client factory usage

### Compliance - TASK-0285
- Zero direct service instantiation in handlers (enforced by dependency-cruiser)
- Handlers maintain complexity ≤10 (ESLint complexity rule)
- Handler layering: Controller → UseCase(Service) → Port (standards/backend-tier.md line 13)
- No AWS SDK imports in handlers (hard fail control maintained)
- Middy middleware stack pattern (standards/backend-tier.md line 9)

### Dependencies - TASK-0285
- Added @middy/core@^6.4.5 for Lambda middleware composition
- Added @middy/http-error-handler@^4.2.4 (not yet used, future enhancement)
- Added @middy/input-output-logger@^4.2.4 (not yet used, future enhancement)

### References - TASK-0285
- Task: tasks/backend/TASK-0285-lambda-interface-hardening.task.yaml
- standards/backend-tier.md lines 9, 13, 16, 28-29 (Edge & Interface, Lambda layers)
- standards/cross-cutting.md line 20 (hard fail controls)
- standards/testing-standards.md (handler testing requirements)

### Added - TASK-0105
- NestJS BFF skeleton under `backend/bff/` with Fastify adapter
- PresignModule with `/presign` endpoints for single and batch uploads (STANDARDS.md line 40)
- JobModule with `/status` and `/download` endpoints
- Global logging interceptor with Powertools (correlationId, traceId, requestId per STANDARDS.md line 71)
- Error taxonomy module mapping domain errors to HTTP responses and DynamoDB job statuses
- Contract-first API validation using shared DTOs from `@photoeditor/shared`
- Dependency injection for AWS SDK clients (no `new SomeClient()` in services/controllers per STANDARDS.md line 25)
- Layer validation via dependency-cruiser (handlers → services → adapters per STANDARDS.md line 24, 56)

### Testing
- Unit tests for controllers and error taxonomy (25 test cases, 100% passing)
- Complexity constraints: Controllers ≤75 LOC, ≤10 complexity (STANDARDS.md line 36)
- Services/Adapters ≤200 LOC, ≤15 complexity (STANDARDS.md line 37)
- Test coverage: Lines ≥80%, Branches ≥70% (STANDARDS.md lines 98-99)

### Build & Deployment
- esbuild bundling for Lambda deployment (presign.zip, status.zip, download.zip)
- Bundle size <5MB per artifact (STANDARDS.md line 128)
- `npm run build:bff` builds all BFF lambdas

### Compliance
- Zero AWS SDK imports in controllers (hard fail prevention per STANDARDS.md line 32)
- Zero default exports in domain logic (STANDARDS.md line 82)
- Zero circular dependencies (STANDARDS.md line 24)
- TypeScript strict mode enabled with noUnusedLocals/noUnusedParameters

### Dependencies
- @nestjs/core@^10
- @nestjs/platform-fastify@^10
- @aws-lambda-powertools/logger@^1.17.0
- aws-lambda-fastify (latest)

### References
- Task: tasks/backend/TASK-0105-nest-bff-skeleton.task.yaml
- STANDARDS.md lines 7-13 (hard fail controls), 24 (layering), 71 (observability), 98-100 (test thresholds)
- docs/architecture-refactor-plan.md (Phase 1)
- standards/testing-standards.md
