# TypeScript Standards

**Version:** 1.0
**Last Updated:** 2025-11-15
**Scope:** All TypeScript code in the monorepo

## Compiler Options

All packages must use strict TypeScript configuration:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

Rationale: Strict mode catches errors at compile time and improves code quality.

## Type Patterns

### Discriminated Unions

Use discriminated unions for state management:

```typescript
type JobState =
  | { status: 'pending'; queuedAt: Date }
  | { status: 'processing'; startedAt: Date; progress: number }
  | { status: 'completed'; completedAt: Date; result: Result }
  | { status: 'failed'; failedAt: Date; error: Error };

function handleJobState(state: JobState) {
  switch (state.status) {
    case 'pending':
      // TypeScript knows state.queuedAt exists
      break;
    case 'processing':
      // TypeScript knows state.progress exists
      break;
    case 'completed':
      // TypeScript knows state.result exists
      break;
    case 'failed':
      // TypeScript knows state.error exists
      break;
    default:
      assertNever(state);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}
```

### Named Exports

All domain code must use named exports (no default exports):

```typescript
// ✓ Good
export function processJob(job: Job): Promise<Result> {}
export const JOB_TIMEOUT = 300_000;

// ✗ Bad
export default function processJob(job: Job): Promise<Result> {}
```

Exception: Config files and React components may use default exports.

## Validation

### Zod at Boundaries

All external input must be validated with Zod schemas:

- API request bodies
- Environment variables
- Configuration files
- External API responses
- Database query results

```typescript
import { z } from 'zod';

const UploadRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string(),
  size: z.number().int().positive().max(10_485_760), // 10MB
});

export type UploadRequest = z.infer<typeof UploadRequestSchema>;
```

Never trust unvalidated input.

## Error Handling

### Result Type Pattern

Use `neverthrow` Result types instead of exceptions for expected errors:

```typescript
import { Result, ok, err } from 'neverthrow';

type ValidationError = { type: 'validation'; message: string };
type NotFoundError = { type: 'not_found'; id: string };
type ServiceError = ValidationError | NotFoundError;

export function findJob(id: string): Result<Job, ServiceError> {
  if (!isValidId(id)) {
    return err({ type: 'validation', message: 'Invalid job ID' });
  }

  const job = database.get(id);
  if (!job) {
    return err({ type: 'not_found', id });
  }

  return ok(job);
}
```

Exceptions should only be used for truly exceptional conditions (programmer errors, system failures).

## Imports

- Use path aliases from `tsconfig.json`
- Group imports: external, internal, relative
- Sort alphabetically within groups
- No circular dependencies

```typescript
// External dependencies
import { z } from 'zod';
import { ok, err } from 'neverthrow';

// Internal packages
import { JobSchema } from '@photoeditor/shared';

// Relative imports
import { processJob } from './processor';
import type { JobState } from './types';
```

## Documentation

- JSDoc for public APIs
- Inline comments for complex logic
- Type annotations for clarity (when inference is unclear)
- No obvious comments (code should be self-documenting)
