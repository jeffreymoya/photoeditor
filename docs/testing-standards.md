# Testing Standards for Task Alignment

This document defines the testing requirements used to detect drift when aligning tasks with STANDARDS.md. Use this to verify that tasks include appropriate test coverage, validation, and evidence requirements.

## Purpose

When reviewing task files, check that testing requirements align with:
1. **STANDARDS.md hard fails** (lines 7-13) - tests must prevent violations
2. **Testability requirements** (lines 44-51) - comprehensive test coverage
3. **Evidence requirements** (lines 126-132) - artifacts and documentation

## QA Suite - Centralized Fitness Functions

The repository uses a centralized QA suite to ensure developers, Husky hooks, and CI execute identical checks. This prevents drift between local validation and CI enforcement.

### Entry Points

- **Script**: `scripts/qa/qa-suite.sh` - Shared driver for all fitness functions
- **Make**: `make qa-suite` - Convenience target that calls the script
- **CI**: `.github/workflows/ci-cd.yml` calls `make qa-suite`
- **Husky**: `.husky/pre-commit` (with skip flags) and `.husky/pre-push` (full suite)

### QA Stages

The QA suite runs five stages in sequence:

1. **QA-A: Static Safety Nets** - TypeScript typecheck and lint (backend, shared, mobile)
2. **QA-B: Contract Drift Detection** - Hash-based contract snapshot validation
3. **QA-C: Core Flow Contracts** - Unit and contract tests
4. **QA-D: Infrastructure & Security** - Terraform fmt/validate, npm audit
5. **QA-E: Build Verification** - Lambda bundle builds, tooling checks

### Skip Controls

For local workflows, individual stages can be skipped via environment variables:

```bash
SKIP_LINT=1 make qa-suite          # Skip static analysis
SKIP_CONTRACTS=1 make qa-suite     # Skip contract drift check
SKIP_TESTS=1 make qa-suite         # Skip tests
SKIP_INFRA=1 make qa-suite         # Skip infrastructure validation
SKIP_BUILD=1 make qa-suite         # Skip build verification
```

Pre-commit hook skips expensive checks by default (tests, infra, builds). Pre-push hook runs the full suite.

### Adding New Fitness Functions

When adding new fitness checks:

1. Add the check to `scripts/qa/qa-suite.sh` in the appropriate stage
2. Document the check in this file under the relevant test type section
3. Add acceptance criteria to task files that reference the new check
4. Ensure the check can be skipped via environment variable if it's expensive

This ensures the check propagates to local hooks and CI automatically.

## Required Test Types by Component

### Handler Tests (Backend)
**From STANDARDS.md lines 19-20**: Handlers must stay under 50 LOC, cyclomatic complexity ≤5

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
    - npm run lint -- --max-complexity=5
    - npm run test:handlers -- --coverage
```

### Service Tests (Backend)
**From STANDARDS.md line 47**: Mutation score ≥60%

Required coverage:
- Business logic happy paths
- Edge cases and boundary conditions
- Error handling and propagation
- Idempotency when applicable

Validation:
```yaml
validation:
  commands:
    - npm run test:mutation -- --threshold 60
    - npm run test:services -- --coverage
```

### Contract Tests
**From STANDARDS.md lines 45, 76-77**: Required for API routes with versioning

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
    - npm run contracts:generate --prefix shared
    - npm run contracts:check --prefix shared
    - scripts/ci/check-route-alignment.sh
    - npm run test:contract --prefix backend
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
**From STANDARDS.md lines 102-103, 121**: Idempotency, DLQ redrive, and E2E job lifecycle required

Required coverage:
- SQS worker idempotency (duplicate message handling)
- DLQ redrive drills (automated tests each release - STANDARDS.md line 121)
- End-to-end job flow (API → S3 → Queue → Worker → DynamoDB)
- Contract compatibility (old clients vs new server - STANDARDS.md line 101)

**LocalStack Requirements:**
- **Mandatory** for backend integration tests that validate SQS/DLQ flows, S3 event triggers, DynamoDB persistence, or multi-service orchestration (STANDARDS.md line 121 DLQ requirements)
- **Optional** for pure service logic tests that can use in-memory mocks
- When LocalStack is used, tests **may enable localhost network access** to communicate with LocalStack endpoints (default: http://localhost:4566)
- External network access beyond LocalStack must remain blocked to prevent non-deterministic behavior

**Network Access Policy:**
- Integration tests using LocalStack: `ALLOW_LOCALHOST=true` (for LocalStack endpoint communication)
- All other external network access: blocked (prevents real AWS calls, third-party APIs)
- Supports hard fail prevention and reliability requirements: DLQ testing (STANDARDS.md line 121), API Lambda VPC compliance (STANDARDS.md line 127)

Validation:
```yaml
validation:
  commands:
    - npm run test:integration --prefix backend
```

Evidence:
```yaml
deliverables:
  - path: docs/evidence/dlq-redrive/runbook.md
  - path: docs/evidence/dlq-redrive/screenshots/
  - path: docs/evidence/integration-tests/worker-pipeline.log
```

### End-to-End (E2E) Tests
**From STANDARDS.md lines 103, 121**: E2E job lifecycle smoke tests and DLQ redrive requirements

Required coverage:
- Complete job lifecycle: presign → upload → S3 event → SQS → Worker → Provider → Notification → Download
- Multi-service orchestration with real AWS service interactions (via LocalStack)
- Contract compatibility across API versions
- DLQ redrive automation and resilience testing
- Batch upload flows and error handling paths

**LocalStack Requirements:**
- **Mandatory** for automated E2E backend tests (STANDARDS.md line 103 requires E2E job lifecycle validation)
- E2E suites orchestrate BFF Lambdas + worker Lambdas + infrastructure together
- Tests must use LocalStack to satisfy reliability requirements: DLQ redrive testing (STANDARDS.md line 121), API Lambda VPC constraints (STANDARDS.md line 127)

**Network Access Policy:**
- E2E tests using LocalStack: `ALLOW_LOCALHOST=true` (for LocalStack endpoint communication at http://localhost:4566)
- External network access beyond LocalStack: blocked (prevents real AWS calls, third-party API dependencies)
- Provider mocks (Gemini, Seedream) must run locally without external network access
- This policy ensures deterministic E2E automation while supporting hard fail prevention (DLQ tests, VPC compliance)

Validation:
```yaml
validation:
  commands:
    - npm run test:e2e --prefix backend
    - npm run test:contract --prefix backend
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
**From STANDARDS.md line 48**: Component hook tests and schema validation

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
    - npm run test:mobile -- --coverage
    - npm run test:schemas
```

### Infrastructure Tests
**From STANDARDS.md lines 122-124**: terraform fmt, validate, policy scans

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

From STANDARDS.md lines 7-13, tasks must include tests that prevent:

1. **Handler SDK imports** (line 8)
```yaml
validation:
  commands:
    - "! grep -r '@aws-sdk' backend/src/lambdas/"
```

2. **Missing DLQ or redrive tests** (line 9)
```yaml
acceptance_criteria:
  - SQS queue has DLQ configured in Terraform
  - Automated DLQ redrive test exists and passes
```

3. **S3 encryption violations** (line 10)
```yaml
validation:
  commands:
    - grep -q "SSE-KMS" infrastructure/modules/storage/main.tf
    - grep -q "customer_managed_key" infrastructure/modules/storage/main.tf
```

4. **API Lambda in VPC** (line 11)
```yaml
constraints:
  - API Lambdas must stay outside VPC (no vpc_config in Terraform)
validation:
  commands:
    - "! grep -A5 'resource \"aws_lambda_function\".*api' infrastructure/ | grep vpc_config"
```

5. **Secrets outside SSM/Secrets Manager** (line 12)
```yaml
validation:
  commands:
    - grep -q "aws_ssm_parameter.*type.*SecureString" infrastructure/
```

6. **Missing structured logs** (line 13)
```yaml
acceptance_criteria:
  - All Lambda functions emit structured JSON logs with correlationId
validation:
  commands:
    - grep -q "correlationId" backend/src/lambdas/**/*.ts
```

## Maintainability Test Requirements

From STANDARDS.md lines 15-51:

### Modularity (lines 16-22)
```yaml
acceptance_criteria:
  - Handlers ≤50 LOC and cyclomatic complexity ≤5
  - No cross-feature imports in mobile (verified by import graph)
  - Handlers only call one service method
```

### Reusability (lines 24-28)
```yaml
acceptance_criteria:
  - Provider selection via SSM configuration
  - Single factory returns AIProvider interface
  - No provider-specific branching in handlers
deliverables:
  - path: docs/evidence/provider-swap-demo.mp4
```

### Analysability (lines 30-36)
```yaml
acceptance_criteria:
  - Lambda Powertools configured with correlationId, requestId, jobId, userId
  - Log retention ≥90 days in Terraform
  - Alarms configured for Lambda errors, API 5XX, SQS age
deliverables:
  - path: docs/evidence/logs/powertools-sample.json
  - path: docs/evidence/alarms/lambda-errors.yaml
```

### Modifiability (lines 38-42)
```yaml
acceptance_criteria:
  - API contracts stable (breaking changes require /v{n} versioning)
  - Feature changes confined to ≤6 files
  - OpenAPI spec updated for any route changes
```

### Testability (lines 44-51)
```yaml
acceptance_criteria:
  - Contract tests for presign and jobs routes pass
  - SQS worker idempotency test demonstrates duplicate handling
  - Mutation score ≥60% for service layer
  - Test data builders provided for handlers and services
  - DLQ redrive drill documented and passing
```

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
- [ ] Does the task create evidence files per STANDARDS.md lines 126-132?
- [ ] Are contract test logs, mutation reports, DLQ runbooks included?

### Acceptance Criteria Alignment
- [ ] Do acceptance criteria reference specific STANDARDS.md requirements?
- [ ] Are thresholds explicit (≤50 LOC, ≤5 complexity, ≥60% mutation)?
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

    # Test execution
    - npm run test:handlers -- --coverage
    - npm run test:services -- --coverage
    - npm run test:mutation -- --threshold 60
    - npm run test:contract

    # Infrastructure validation
    - cd infrastructure && terraform fmt -check && terraform validate
    - tfsec infrastructure/ --soft-fail

    # Complexity checks
    - npm run lint -- --max-complexity=5

acceptance_criteria:
  # Testability (STANDARDS.md lines 44-51)
  - Contract tests pass for presign and jobs routes
  - SQS worker idempotency test demonstrates duplicate message handling
  - Service layer mutation score ≥60%
  - Handlers have cyclomatic complexity ≤5 (builds fail at >10)
  - Test data builders provided for handlers and services

  # Hard fails prevented (STANDARDS.md lines 7-13)
  - No handler imports @aws-sdk/* (verified by grep)
  - DLQ configured with automated redrive test
  - Final S3 bucket uses SSE-KMS with CMK
  - API Lambdas remain outside VPC
  - Secrets stored in SSM SecureString
  - Structured JSON logs emit correlationId

deliverables:
  # Evidence per STANDARDS.md lines 126-132
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
npm run test:integration --prefix backend
```

This command:
- Sets `ALLOW_LOCALHOST=true` for LocalStack endpoint communication (http://localhost:4566)
- Runs integration tests in `backend/tests/integration/`
- Validates end-to-end flows with LocalStack-backed AWS service mocks (S3, SQS, DynamoDB, SNS)
- Verifies idempotency and DLQ behavior (STANDARDS.md line 121 DLQ redrive requirements)
- Blocks external network access beyond LocalStack (prevents non-deterministic real AWS calls)

**LocalStack Integration Policy:**
- **Required** for tests validating SQS/DLQ flows (STANDARDS.md line 121), S3 event triggers, DynamoDB persistence, multi-service orchestration
- **Not required** for pure service logic tests that can use in-memory mocks
- Supports reliability and performance requirements: DLQ testing (STANDARDS.md line 121), API Lambda VPC constraints (STANDARDS.md line 127)

**Note**: The legacy pattern `npm run test --prefix backend tests/integration` is deprecated. All documentation and tasks should reference `npm run test:integration` for consistency and to leverage the proper environment configuration.

### Backend E2E Tests

Use the canonical command:
```bash
npm run test:e2e --prefix backend
```

This command:
- Sets `ALLOW_LOCALHOST=true` for LocalStack endpoint communication (http://localhost:4566)
- Orchestrates full job lifecycle: BFF → S3 → SQS → Worker → Provider → Notification
- Runs E2E tests in `backend/tests/e2e/`
- Validates contract compatibility, DLQ redrive automation, batch flows (STANDARDS.md lines 103, 121)
- Uses local provider mocks (Gemini, Seedream) without external network dependencies
- Blocks external network access beyond LocalStack (ensures deterministic automation)

**LocalStack E2E Policy:**
- **Mandatory** for automated E2E backend tests (STANDARDS.md line 103 requires E2E job lifecycle smoke tests)
- Orchestrates BFF Lambdas + worker Lambdas + infrastructure components together
- Satisfies reliability and performance requirements: DLQ redrive testing (STANDARDS.md line 121), API Lambda VPC validation (STANDARDS.md line 127)
- Enables localhost networking for LocalStack while blocking all other external network access

## References
- STANDARDS.md lines 30-43: Hard Fail Controls (cross-cutting)
- STANDARDS.md lines 94-104: Testability (Coverage, Mutation, Contract Compatibility, Idempotency, E2E)
- STANDARDS.md line 103: E2E job lifecycle requirement
- STANDARDS.md line 121: SQS DLQ and redrive drill requirement (Reliability)
- STANDARDS.md line 127: API Lambda VPC constraint (Performance Efficiency)
- STANDARDS.md lines 216-233: PR Gates (enforced)
- STANDARDS.md lines 236-244: Evidence Requirements
