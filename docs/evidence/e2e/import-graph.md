# E2E Test Import Graph

Generated: Pending first validation run
Test Suite: E2E LocalStack Tests

## Purpose

Validates dependency structure per STANDARDS.md:
- No cycles allowed
- Handlers → Services → Adapters pattern enforced
- No direct SDK imports in handlers/services

## Expected Structure

```
steps/
  ├── presign.steps.ts
  ├── status.steps.ts
  ├── batch.steps.ts
  ├── worker.steps.ts
  └── ...
  ↓ (uses)
support/world.ts
  ↓ (provides)
adapters/
  ├── api.adapter.ts     (HTTP client)
  ├── s3.adapter.ts      (@aws-sdk/client-s3)
  └── sqs.adapter.ts     (@aws-sdk/client-sqs)
  ↓ (uses)
src/libs/aws-clients.ts  (SDK factory)

services/
  ├── polling.service.ts
  └── trace-validator.service.ts
```

## Validation

```bash
# Generate dependency graph
npm run dep:graph --prefix backend

# Validate no cycles and layer violations
npm run dep:validate --prefix backend
```

## Notes

- All E2E test code follows adapters-only SDK usage
- No @aws-sdk/* imports in step definitions or services
- Complexity constraints: ≤5 for adapters, ≤8 for services
- Graph will be generated on next test run with `depcruise`
