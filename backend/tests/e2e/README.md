# E2E Test Suite

Automated end-to-end test suite for PhotoEditor using LocalStack and Cucumber.js.

## Architecture

Following STANDARDS.md handlers→services→adapters pattern:

```
backend/tests/e2e/
├── adapters/           # AWS SDK wrappers (S3, SQS, API HTTP)
│   ├── s3.adapter.ts
│   ├── sqs.adapter.ts
│   └── api.adapter.ts
├── services/           # Business logic for testing
│   ├── polling.service.ts         # Bounded polling (no sleep-based waits)
│   └── trace-validator.service.ts # W3C traceparent validation
├── steps/              # Cucumber step definitions
│   ├── common.steps.ts
│   ├── presign.steps.ts
│   ├── status.steps.ts
│   ├── batch.steps.ts
│   ├── worker.steps.ts
│   ├── contract-compatibility.steps.ts
│   └── dlq-redrive.steps.ts
├── support/            # Test infrastructure
│   ├── world.ts        # Cucumber world context
│   └── hooks.ts        # Before/After hooks
├── fixtures/           # Test data builders
│   ├── test-data.builder.ts
│   └── images/         # Sample test images
├── features/           # Gherkin feature files
│   └── photoeditor-e2e.feature
└── setup.ts            # Environment bootstrap

## Complexity Constraints

Per STANDARDS.md line 36:
- Handlers/Adapters: ≤5 cyclomatic complexity, ≤75 LOC
- Services: ≤8 cyclomatic complexity, ≤200 LOC
- All functions validated with `npm run lint -- --max-complexity=5`

## Running Tests

```bash
# Complete E2E suite (setup + run + teardown)
npm run test:e2e --prefix backend

# Individual steps
npm run test:e2e:setup   # Start LocalStack
npm run test:e2e:run     # Run Cucumber tests
npm run test:e2e:teardown # Stop LocalStack
```

## Scenario Coverage

All scenarios from `docs/e2e-localstack.feature`:
1. ✅ Single image upload (happy path)
2. ✅ Status endpoint with path parameter
3. ✅ S3→SQS→Worker event wiring
4. ✅ Batch upload with completion tracking
5. ✅ Validation error (unsupported content type)
6. ✅ Resilience fallback (provider error handling)

Plus additional coverage:
- Contract compatibility matrix (old↔new client/server)
- DLQ redrive drill automation
- W3C traceparent propagation
- Structured logging validation

## Evidence Artifacts

Generated in `docs/evidence/e2e/`:
- `latest/report.html` - HTML test report
- `trace-coverage-report.json` - ≥95% trace coverage
- `contract-compatibility-matrix.log` - API versioning tests
- `dlq-redrive-runbook.md` - DLQ recovery procedures
- `flake-rate-report.json` - Flake tracking (≤1% threshold)
- `logs/powertools-sample.json` - Structured log sample

## Hard Fail Prevention

Per STANDARDS.md lines 30-43:
- ✅ No `@aws-sdk/*` imports in test orchestration (adapters only)
- ✅ Bounded polling (no sleep-based waits) per testing-standards.md
- ✅ W3C traceparent propagation end-to-end
- ✅ Structured JSON logs with correlationId
- ✅ DLQ configured and tested
- ✅ Contract compatibility validated

## Determinism

- Fixed test data builders
- Bounded retry logic with exponential backoff
- LocalStack state isolation
- No real AWS endpoints (ALLOW_LOCALHOST=true)
- Traceparent generation for reproducible traces
