# Backend Tier Standards

**Version:** 1.0
**Last Updated:** 2025-11-15
**Scope:** Backend Lambda handlers, services, and providers

## Handler Constraints

All Lambda handlers must adhere to the following constraints:

- **Complexity Limit:** Cyclomatic complexity ≤10 (enforced as hard fail)
- **Line Count:** Handler function body ≤75 lines of code
- **Single Responsibility:** Each handler orchestrates services only
- **No Direct Dependencies:** Handlers cannot import AWS SDK clients directly
- **No Provider Imports:** Handlers cannot import provider modules

Rationale: Handlers should be thin orchestration layers that delegate to services.

## Layering Rules

The backend follows strict unidirectional dependency flow:

```
Handlers (lambdas/) → Services → Providers
```

- Handlers orchestrate services
- Services contain business logic and may call other services
- Providers are isolated adapters (cannot import handlers or services)
- Zero circular dependencies (enforced as hard fail)

Enforced by: `tooling/dependency-cruiser` rules in `dependency-rules.json`

## Testing Requirements

### Services and Adapters

All service layer code must meet these coverage thresholds:

- **Line Coverage:** ≥80%
- **Branch Coverage:** ≥70%
- **Function Coverage:** ≥75%

### Handlers

Handlers must have:

- Integration tests covering happy path
- Error handling tests for all service failure modes
- Input validation tests for all Zod schemas

### Test Organization

```
backend/
├── lambdas/
│   └── upload/
│       ├── handler.ts
│       └── __tests__/
│           └── handler.test.ts
└── services/
    ├── upload.ts
    └── __tests__/
        └── upload.test.ts
```

## Error Handling

All services must use `neverthrow` Result types:

```typescript
import { Result, ok, err } from 'neverthrow';

export async function processUpload(
  jobId: string
): Promise<Result<Job, ProcessingError>> {
  // Implementation
}
```

No exceptions for control flow (only for truly exceptional conditions).

## Observability

All handlers and services must include:

- Structured logging with correlation IDs
- Metrics for operation duration
- Error rate tracking
- Success/failure counters

## Performance

- Handler cold start: <2s (p99)
- Handler execution: <5s (p95)
- Service operations: <1s (p95)
