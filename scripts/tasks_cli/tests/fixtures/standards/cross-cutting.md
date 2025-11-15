# Cross-Cutting Standards

**Version:** 1.0
**Last Updated:** 2025-11-15
**Scope:** All tiers (backend, mobile, shared, infrastructure)

## Hard Fail Controls

These constraints MUST be enforced as build failures:

### No AWS SDK in Handlers

Lambda handlers cannot import AWS SDK clients directly:

```typescript
// ✗ FORBIDDEN
import { S3Client } from '@aws-sdk/client-s3';

export async function handler(event: Event) {
  const s3 = new S3Client({});
  // ...
}

// ✓ REQUIRED
import { processUpload } from '../services/upload';

export async function handler(event: Event) {
  const result = await processUpload(event);
  // ...
}
```

Enforced by: `dependency-cruiser` rule in `tooling/dependency-rules.json`

### Zero Circular Dependencies

No circular imports allowed anywhere in the codebase:

```typescript
// ✗ FORBIDDEN
// file-a.ts imports file-b.ts
// file-b.ts imports file-a.ts

// ✓ REQUIRED
// Extract shared code to file-c.ts
// Both file-a.ts and file-b.ts import file-c.ts
```

Enforced by: `dependency-cruiser` with `circular` rule

### Complexity Budgets

- Handlers: Cyclomatic complexity ≤10
- Services: Cyclomatic complexity ≤15
- Utilities: Cyclomatic complexity ≤20

Enforced by: ESLint `complexity` rule

## Security

### Input Validation

All external input MUST be validated:

- API requests: Zod schemas
- Environment variables: Validated on startup
- File uploads: Content type and size checks
- Database queries: Parameterized queries only

### Secret Management

Never commit secrets to git:

- Use AWS Secrets Manager for production secrets
- Use `.env.local` for local development (git-ignored)
- Use `.env.example` for templates (checked in)
- Fail fast if required secrets missing

### Dependency Scanning

- Run `pnpm audit` before every release
- No high/critical vulnerabilities in production
- Document and track accepted risks for medium vulnerabilities

## Observability

### Structured Logging

All logs must be structured JSON:

```typescript
logger.info('Job processing started', {
  jobId,
  fileName,
  correlationId,
  timestamp: new Date().toISOString(),
});
```

Never use `console.log` in production code.

### Correlation IDs

Every request must have a correlation ID:

- Generated at API Gateway
- Propagated through all services
- Included in all logs
- Returned in error responses

### Metrics

Track these metrics for all operations:

- Duration (p50, p95, p99)
- Success/failure counts
- Error rates by type
- Resource utilization

## Testing

### Coverage Thresholds

Minimum coverage requirements:

- Services: 80% lines, 70% branches
- Utilities: 90% lines, 85% branches
- Handlers: 70% lines (integration tests)

### Test Organization

```
src/
├── services/
│   ├── upload.ts
│   └── __tests__/
│       └── upload.test.ts
```

Never colocate tests with implementation (except `__tests__` directories).

### Test Isolation

- No shared state between tests
- Mock all external dependencies
- Use test databases (never production)
- Clean up resources in `afterEach`

## Performance

### Response Times

- API endpoints: <200ms (p95)
- Lambda cold start: <2s (p99)
- Lambda warm execution: <1s (p95)

### Resource Limits

- Lambda memory: 1GB default, 3GB max
- Lambda timeout: 30s default, 5min max
- API payload: 6MB max (API Gateway limit)

## Maintainability

### Code Review

All changes require:
- Self-review checklist completed
- Standards citations in description
- Tests included
- Documentation updated

### Refactoring

When refactoring:
- Preserve existing tests (prove behavior unchanged)
- Add new tests for edge cases
- Update ADRs if architectural decisions change
- Reference specific standards in commit messages
