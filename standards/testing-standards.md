# Testing Standards for Task Alignment

This document defines the testing requirements used to detect drift when aligning tasks with the standards library under `standards/`. Use this to verify that tasks include appropriate test coverage, validation, and evidence requirements.

## Purpose

When reviewing task files, check that testing requirements align with:
1. **Hard-fail controls** in `standards/cross-cutting.md#hard-fail-controls` - tests must prevent violations
2. **Maintainability and testability gates** in `standards/cross-cutting.md#maintainability--change-impact` and `standards/backend-tier.md#platform--quality-layer`
3. **Evidence governance** in `standards/global.md#governance--evidence` - artifacts and documentation

## QA Suite - Centralized Fitness Functions

The repository uses **pnpm workspaces** and **Turborepo** for orchestrated QA checks. This ensures developers, Husky hooks, and CI execute identical checks with deterministic caching. This prevents drift between local validation and CI enforcement.

### Remote Caching (ADR-0007)

Turborepo remote caching is enabled to share build artifacts across local and CI environments:

- **Backend**: Vercel Remote Cache (free tier)
- **Authentication**: Vercel team tokens stored in AWS SSM Parameter Store
- **Configuration**: Environment variables (`TURBO_TOKEN`, `TURBO_TEAM`)
- **Benefits**: Reduces CI build times from ~8min to ~2min (estimated), speeds up local development

**For local development** (optional):
1. Generate a personal Vercel token: https://vercel.com/account/tokens
2. Export in your shell: `export TURBO_TOKEN=<your-token>`
3. Set team: `export TURBO_TEAM=photoeditor`
4. Verify: `pnpm turbo run build --dry-run` (should show remote cache enabled)

**For CI**: Token is automatically injected from GitHub Secrets (sourced from AWS SSM `/photoeditor/turborepo/token`).

**Cache behavior**: Turbo gracefully falls back to local-only caching if remote cache is unavailable or credentials are not configured. This ensures builds never fail due to cache connectivity issues.

### Entry Points

- **Turbo**: `pnpm turbo run qa --parallel` - Orchestrates all fitness functions via Turborepo
- **Make**: `make qa-suite` - Convenience target that delegates to turbo
- **CI**: `.github/workflows/ci-cd.yml` calls `pnpm turbo run qa --parallel`
- **Husky**: `.husky/pre-commit` (static checks only) and `.husky/pre-push` (full QA suite)

### QA Stages

The QA suite runs five stages in sequence:

1. **QA-A: Static Safety Nets** - TypeScript typecheck and lint (backend, shared, mobile)
2. **QA-B: Contract Drift Detection** - Hash-based contract snapshot validation
3. **QA-C: Core Flow Contracts** - Unit and contract tests
4. **QA-D: Infrastructure & Security** - Terraform fmt/validate, npm audit
5. **QA-E: Build Verification** - Lambda bundle builds, tooling checks

### Skip Controls and Filtering

Turborepo provides powerful filtering for running specific tasks:

```bash
# Run only static checks (fast)
pnpm turbo run qa:static --parallel

# Run tests for a specific package
pnpm turbo run test --filter=@photoeditor/backend

# Run affected packages only
pnpm turbo run lint --filter=...

# Dry run to see what would execute
pnpm turbo run qa --dry-run
```

Pre-commit hook runs only static checks (`qa:static`) for speed. Pre-push hook runs the full QA suite (`qa`).

### Adding New Fitness Functions

When adding new fitness checks:

1. Add the task to `turbo.json` pipeline with appropriate dependencies
2. Add the script to workspace package.json files (backend, mobile, shared)
3. Document the check in this file under the relevant test type section
4. Add acceptance criteria to task files that reference the new check

This ensures the check propagates to local hooks and CI automatically via Turborepo's dependency graph.

## Required Test Types by Component

### Handler Tests (Backend)
Per `standards/backend-tier.md#platform--quality-layer`, handlers must stay under 75 LOC with cyclomatic complexity ≤10.

Required coverage:
- Input validation (valid and invalid inputs)
- Error mapping (domain errors → HTTP status codes)
- DTO mapping (service results → API responses)
- Correlation ID propagation
- No direct SDK/database imports (hard fail prevention)

Validation:
```yaml
validation:
  commands:
    - pnpm turbo run lint --filter=@photoeditor/backend -- --max-complexity=10
    - pnpm turbo run test --filter=@photoeditor/backend -- --testPathPattern=lambdas --coverage
```

### Service Tests (Backend)
Per `standards/backend-tier.md#platform--quality-layer` and `standards/cross-cutting.md#maintainability--change-impact`, services and adapters must sustain ≥60% mutation score (≥80% target) alongside ≥80% line and ≥70% branch coverage.

Required coverage:
- Business logic happy paths
- Edge cases and boundary conditions
- Error handling and propagation
- Idempotency when applicable

Validation:
```yaml
validation:
  commands:
    - pnpm turbo run test:mutation --filter=@photoeditor/backend -- --threshold 60
    - pnpm turbo run test --filter=@photoeditor/backend -- --testPathPattern=services --coverage
```

### Contract Tests
Per `standards/backend-tier.md#edge--interface-layer` and `standards/shared-contracts-tier.md#fitness-gates`, every versioned API route requires contract tests with generated clients kept in sync.

Required coverage:
- `POST /v1/upload/presign` (request/response structure, presigned URL format)
- `GET /v1/jobs/{id}` (job status transitions, error responses)
- `GET /v1/jobs/{id}/download` (download URL generation)
- `POST /v1/device-tokens` (push notification registration)
- Each API version (`/v1`, `/v2`, etc.) tested independently

**Contract-First Routing** (TASK-0602, ADR-0003):
- Routes defined in `shared/routes.manifest.ts` serve as source of truth
- OpenAPI spec generated from manifest with populated `paths`
- CI enforces route alignment: `scripts/ci/check-route-alignment.sh`
- Breaking changes require new versioned path (e.g., `/v2/`)

Validation:
```yaml
validation:
  commands:
    - pnpm turbo run contracts:generate --filter=@photoeditor/shared
    - pnpm turbo run contracts:check --filter=@photoeditor/shared
    - scripts/ci/check-route-alignment.sh
    - pnpm turbo run test:contract --filter=@photoeditor/backend
```

Evidence:
```yaml
deliverables:
  - path: docs/evidence/contract-tests/presign-contract.log
  - path: docs/evidence/contract-tests/jobs-contract.log
  - path: docs/openapi/openapi-generated.yaml
  - path: docs/contracts/clients/photoeditor-api.ts
```

### Integration Tests
Guided by `standards/backend-tier.md#lambda-application-layer` (idempotency), `standards/cross-cutting.md#reliability--cost` (DLQ drills), and `standards/shared-contracts-tier.md#fitness-gates` (contract compatibility).

Required coverage:
- SQS worker idempotency (duplicate message handling)
- DLQ redrive drills (automated tests each release per `standards/cross-cutting.md#reliability--cost`)
- End-to-end job flow (API → S3 → Queue → Worker → DynamoDB)
- Contract compatibility (old clients vs new server) per `standards/shared-contracts-tier.md#fitness-gates`

**LocalStack Requirements:**
- **Mandatory** for backend integration tests that validate SQS/DLQ flows, S3 event triggers, DynamoDB persistence, or multi-service orchestration (`standards/cross-cutting.md#reliability--cost`)
- **Optional** for pure service logic tests that can use in-memory mocks
- When LocalStack is used, tests **may enable localhost network access** to communicate with LocalStack endpoints (default: http://localhost:4566)
- External network access beyond LocalStack must remain blocked to prevent non-deterministic behavior

**Network Access Policy:**
- Integration tests using LocalStack: `ALLOW_LOCALHOST=true` (for LocalStack endpoint communication)
- All other external network access: blocked (prevents real AWS calls, third-party APIs)
- Supports hard fail prevention and reliability requirements: DLQ testing (`standards/cross-cutting.md#reliability--cost`), API Lambda VPC compliance (`standards/cross-cutting.md#reliability--cost`)

Validation:
```yaml
validation:
  commands:
    - pnpm turbo run test:integration --filter=@photoeditor/backend
```

Evidence:
```yaml
deliverables:
  - path: docs/evidence/dlq-redrive/runbook.md
  - path: docs/evidence/dlq-redrive/screenshots/
  - path: docs/evidence/integration-tests/worker-pipeline.log
```

### End-to-End (E2E) Tests
Anchor the suite to `standards/global.md#example-quality-gate-drop-into-ci` (end-to-end coverage), `standards/backend-tier.md#lambda-application-layer` (idempotent handlers), and `standards/cross-cutting.md#reliability--cost` (DLQ redrive).

**Framework:** Playwright (`@playwright/test`)
- E2E tests use Playwright for native browser automation with TypeScript
- **BDD/Gherkin/Cucumber are NOT used** - see `docs/evidence/cucumber-retrospective.md` for retirement rationale
- Playwright provides better TypeScript support, faster execution, and simpler maintenance
- Smoke tests located in `backend/tests/smoke/` with configuration in `backend/playwright.config.ts`

Required coverage:
- Complete job lifecycle: presign → upload → S3 event → SQS → Worker → Provider → Notification → Download
- Multi-service orchestration with real AWS service interactions (via LocalStack)
- Contract compatibility across API versions
- DLQ redrive automation and resilience testing
- Batch upload flows and error handling paths

**LocalStack Requirements:**
- **Mandatory** for automated E2E backend tests to satisfy `standards/global.md#example-quality-gate-drop-into-ci`
- E2E suites orchestrate BFF Lambdas + worker Lambdas + infrastructure together
- Tests must use LocalStack to satisfy reliability requirements: DLQ redrive testing (`standards/cross-cutting.md#reliability--cost`), API Lambda VPC constraints (`standards/cross-cutting.md#reliability--cost`)

**Network Access Policy:**
- E2E tests using LocalStack: `ALLOW_LOCALHOST=true` (for LocalStack endpoint communication at http://localhost:4566)
- External network access beyond LocalStack: blocked (prevents real AWS calls, third-party API dependencies)
- Provider mocks (Gemini, Seedream) must run locally without external network access
- This policy ensures deterministic E2E automation while supporting hard fail prevention (DLQ tests, VPC compliance)

Validation:
```yaml
validation:
  commands:
    - pnpm turbo run smoke:e2e --filter=@photoeditor/backend  # Playwright smoke tests
    - pnpm turbo run test:contract --filter=@photoeditor/backend
```

Evidence:
```yaml
deliverables:
  - path: docs/evidence/e2e/trace-coverage-report.json
  - path: docs/evidence/e2e/contract-compatibility-matrix.log
  - path: docs/evidence/e2e/dlq-redrive-runbook.md
  - path: docs/evidence/e2e/flake-rate-report.json
```

### Mobile Tests
Per `standards/frontend-tier.md#platform--delivery-layer` (Detox + navigation coverage) and `standards/frontend-tier.md#services--integration-layer` (contract clients and adapters).

Required coverage:
- Feature components and screens
- Custom hooks with state variations
- Zod schemas for API responses
- Upload flows (retry, backoff, resume, offline persistence)
- NetInfo mocking (connectivity state changes)

Validation:
```yaml
validation:
  commands:
    - pnpm turbo run test --filter=photoeditor-mobile -- --coverage
    - pnpm turbo run test --filter=@photoeditor/shared
```

### Infrastructure Tests
Per `standards/infrastructure-tier.md#terraform-control-plane--modules` and `standards/infrastructure-tier.md#messaging--notifications`, infrastructure tasks must validate Terraform syntax/policies and enforce DLQ posture.

Required validation:
- `terraform fmt -check`
- `terraform validate`
- `tfsec` clean or justified exceptions
- `checkov` clean or justified exceptions

Validation:
```yaml
validation:
  commands:
    - cd infrastructure && terraform fmt -check
    - cd infrastructure && terraform validate
    - tfsec infrastructure/ --soft-fail
    - checkov -d infrastructure/
```

## Hard Fail Prevention Tests

Grounded in `standards/cross-cutting.md#hard-fail-controls`, tasks must include tests that prevent:

1. **Handler SDK imports**
```yaml
validation:
  commands:
    - "! grep -r '@aws-sdk' backend/src/lambdas/"
```

2. **Missing DLQ or redrive tests**
```yaml
acceptance_criteria:
  - SQS queue has DLQ configured in Terraform
  - Automated DLQ redrive test exists and passes
```

3. **S3 encryption violations**
```yaml
validation:
  commands:
    - grep -q "SSE-KMS" infrastructure/modules/storage/main.tf
    - grep -q "customer_managed_key" infrastructure/modules/storage/main.tf
```

4. **API Lambda in VPC**
```yaml
constraints:
  - API Lambdas must stay outside VPC (no vpc_config in Terraform)
validation:
  commands:
    - "! grep -A5 'resource \"aws_lambda_function\".*api' infrastructure/ | grep vpc_config"
```

5. **Secrets outside SSM/Secrets Manager**
```yaml
validation:
  commands:
    - grep -q "aws_ssm_parameter.*type.*SecureString" infrastructure/
```

6. **Missing structured logs**
```yaml
acceptance_criteria:
  - All Lambda functions emit structured JSON logs with correlationId
validation:
  commands:
    - grep -q "correlationId" backend/src/lambdas/**/*.ts
```

## Maintainability Test Requirements

Aligned with `standards/cross-cutting.md#maintainability--change-impact`, `standards/cross-cutting.md#observability--operations`, and tier standards.

### Modularity (cross-cutting maintainability)
```yaml
acceptance_criteria:
  - Handlers ≤75 LOC and cyclomatic complexity ≤10
  - No cross-feature imports in mobile (verified by import graph)
  - Handlers only call one service method
```

### Reusability (backend/provider tiers)
```yaml
acceptance_criteria:
  - Provider selection via SSM configuration
  - Single factory returns AIProvider interface
  - No provider-specific branching in handlers
deliverables:
  - path: docs/evidence/provider-swap-demo.mp4
```

### Analysability (cross-cutting observability)
```yaml
acceptance_criteria:
  - Lambda Powertools configured with correlationId, requestId, jobId, userId
  - Log retention ≥90 days in Terraform
  - Alarms configured for Lambda errors, API 5XX, SQS age
deliverables:
  - path: docs/evidence/logs/powertools-sample.json
  - path: docs/evidence/alarms/lambda-errors.yaml
```

### Modifiability (shared contracts tier)
```yaml
acceptance_criteria:
  - API contracts stable (breaking changes require /v{n} versioning)
  - Feature changes confined to ≤6 files
  - OpenAPI spec updated for any route changes
```

### Testability (cross-cutting maintainability)
```yaml
acceptance_criteria:
  - Contract tests for presign and jobs routes pass
  - SQS worker idempotency test demonstrates duplicate handling
  - Mutation score ≥60% for service layer
  - Test data builders provided for handlers and services
  - DLQ redrive drill documented and passing
```

### Maintainable Test Implementation Heuristics
- Keep Lambda handlers as thin adapters that delegate to injected services so core logic stays unit-testable; pair fast service/handler specs with LocalStack-backed integration tests that cover IAM, quotas, and infrastructure wiring before release.
- Treat LocalStack-powered suites as the default for distributed flows but record any AWS parity gaps discovered during cloud validation runs so drift between emulator and real accounts gets remediated in the next sprint.
- For Expo/React Native, standardize on React Native Testing Library queries that match user intent, lean on `jest-expo` mocks, and reserve snapshots for deliberate visual contracts to avoid brittle UI checks.
- Use dependency-aware test selection (e.g., Nx/Turborepo affected targets) to limit suites to touched packages, keep specs co-located with their subjects, and require owners to update neighboring tests when modules move.
- Bake anti-flake guardrails into CI by periodically randomizing Jest execution order, banning shared mutable mocks, and forcing isolated test setup/teardown so suites stay order-independent over time.
- Scope each consumer contract test to a single interaction, automate Pact verification in CI, and keep provider behavior tests on the provider side to prevent cross-team coupling.

## Drift Detection Checklist

When aligning a task, verify:

### Coverage Gaps
- [ ] Are all relevant test types included? (handler, service, contract, integration, mobile, infrastructure)
- [ ] Do tests cover both happy paths and error cases?
- [ ] Are hard fail scenarios explicitly tested?

### Validation Automation
- [ ] Can all tests run in CI without manual steps?
- [ ] Are validation commands included in task's `validation.commands`?
- [ ] Do builds fail on threshold violations (complexity >10, mutation <60%)?

### Evidence Requirements
- [ ] Are required artifacts listed in `deliverables`?
- [ ] Does the task create evidence files per `standards/global.md#governance--evidence`?
- [ ] Are contract test logs, mutation reports, DLQ runbooks included?

### Acceptance Criteria Alignment
- [ ] Do acceptance criteria reference specific clauses from the `standards/` library?
- [ ] Are thresholds explicit (≤75 LOC, ≤10 complexity, ≥80% line, ≥70% branch, ≥60% mutation)?
- [ ] Are hard fails explicitly prevented in acceptance criteria?

### Scope Exclusions
- [ ] Are prohibited patterns in `scope.out`? (handler SDK imports, VPC for API Lambdas)
- [ ] Are breaking changes without versioning excluded?
- [ ] Are manual-only tests excluded in favor of automation?

## Task Template: Testing Section

```yaml
validation:
  commands:
    # Hard fail prevention
    - "! grep -r '@aws-sdk' backend/src/lambdas/"
    - grep -q "aws_dead_letter_queue" infrastructure/modules/messaging/

    # Test execution via Turborepo
    - pnpm turbo run test --filter=@photoeditor/backend
    - pnpm turbo run test:mutation --filter=@photoeditor/backend -- --threshold 60
    - pnpm turbo run test:contract --filter=@photoeditor/backend

    # Infrastructure validation
    - cd infrastructure && terraform fmt -check && terraform validate
    - tfsec infrastructure/ --soft-fail

    # Complexity checks (standards/backend-tier.md#platform--quality-layer)
    - pnpm turbo run lint --filter=@photoeditor/backend -- --max-complexity=10

acceptance_criteria:
  # Testability (standards/cross-cutting.md#maintainability--change-impact)
  - Contract tests pass for presign and jobs routes
  - SQS worker idempotency test demonstrates duplicate message handling
  - Service layer mutation score ≥60%
  - Handlers have cyclomatic complexity ≤10 (lint fails above 10)
  - Test data builders provided for handlers and services

  # Hard fails prevented (standards/cross-cutting.md#hard-fail-controls)
  - No handler imports @aws-sdk/* (verified by grep)
  - DLQ configured with automated redrive test
  - Final S3 bucket uses SSE-KMS with CMK
  - API Lambdas remain outside VPC
  - Secrets stored in SSM SecureString
  - Structured JSON logs emit correlationId

deliverables:
  # Evidence per standards/global.md#governance--evidence
  - path: docs/evidence/contract-tests/presign.log
  - path: docs/evidence/contract-tests/jobs.log
  - path: docs/evidence/mutation-reports/services.html
  - path: docs/evidence/dlq-redrive/runbook.md
  - path: docs/evidence/logs/powertools-sample.json
  - path: docs/evidence/import-graph.png

scope:
  out:
    - Manual-only tests (all tests must run in CI)
    - Testing implementation details vs. behavior
    - Real AWS calls in unit tests (use LocalStack for integration/E2E, in-memory mocks for unit tests)
    - External network access beyond LocalStack (integration and E2E tests use localhost for LocalStack only)
```

## Test Command Reference

### Backend Integration Tests

Use the canonical command:
```bash
pnpm turbo run test:integration --filter=@photoeditor/backend
```

This command:
- Sets `ALLOW_LOCALHOST=true` for LocalStack endpoint communication (http://localhost:4566)
- Runs integration tests in `backend/tests/integration/`
- Validates end-to-end flows with LocalStack-backed AWS service mocks (S3, SQS, DynamoDB, SNS)
- Verifies idempotency and DLQ behavior (`standards/backend-tier.md#lambda-application-layer`, `standards/cross-cutting.md#reliability--cost`)
- Blocks external network access beyond LocalStack (prevents non-deterministic real AWS calls)

**LocalStack Integration Policy:**
- **Required** for tests validating SQS/DLQ flows, S3 event triggers, DynamoDB persistence, multi-service orchestration (`standards/cross-cutting.md#reliability--cost`, `standards/infrastructure-tier.md#messaging--notifications`)
- **Not required** for pure service logic tests that can use in-memory mocks
- Supports reliability and performance requirements: DLQ testing (`standards/cross-cutting.md#reliability--cost`), API Lambda VPC constraints (`standards/cross-cutting.md#reliability--cost`)

### Backend E2E Tests (Playwright Smoke Tests)

Use the canonical command:
```bash
pnpm turbo run smoke:e2e --filter=@photoeditor/backend
```

This command:
- Runs Playwright-based smoke tests from `backend/tests/smoke/`
- Sets `ALLOW_LOCALHOST=true` for LocalStack endpoint communication (http://localhost:4566)
- Orchestrates full job lifecycle: BFF → S3 → SQS → Worker → Provider → Notification
- Validates contract compatibility, DLQ redrive automation, batch flows (`standards/shared-contracts-tier.md#fitness-gates`, `standards/cross-cutting.md#reliability--cost`)
- Uses local provider mocks (Gemini, Seedream) without external network dependencies
- Blocks external network access beyond LocalStack (ensures deterministic automation)

**Framework Choice:**
- **Playwright** is the standard E2E framework (not Cucumber/Gherkin/BDD)
- Better TypeScript integration, faster execution, simpler maintenance
- See `docs/evidence/cucumber-retrospective.md` for detailed rationale

**LocalStack E2E Policy:**
- **Mandatory** for automated E2E backend tests (`standards/global.md#example-quality-gate-drop-into-ci`)
- Orchestrates BFF Lambdas + worker Lambdas + infrastructure components together
- Satisfies reliability and performance requirements: DLQ redrive testing (`standards/cross-cutting.md#reliability--cost`), API Lambda VPC validation (`standards/cross-cutting.md#reliability--cost`)
- Enables localhost networking for LocalStack while blocking all other external network access

## References
- standards/cross-cutting.md#hard-fail-controls
- standards/cross-cutting.md#maintainability--change-impact
- standards/cross-cutting.md#reliability--cost
- standards/cross-cutting.md#observability--operations
- standards/backend-tier.md#edge--interface-layer
- standards/backend-tier.md#lambda-application-layer
- standards/backend-tier.md#platform--quality-layer
- standards/frontend-tier.md#platform--delivery-layer
- standards/shared-contracts-tier.md#fitness-gates
- standards/infrastructure-tier.md#terraform-control-plane--modules
- standards/global.md#example-quality-gate-drop-into-ci
- standards/global.md#governance--evidence
