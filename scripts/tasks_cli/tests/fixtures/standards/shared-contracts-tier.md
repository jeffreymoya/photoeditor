# Shared Contracts Tier Standards

**Version:** 1.0
**Last Updated:** 2025-11-15
**Scope:** Shared package (`@photoeditor/shared`)

## Contract-First API Design

All APIs must follow contract-first design:

1. Define Zod schemas in `shared/schemas/`
2. Generate TypeScript types from schemas
3. Backend validates against schemas
4. Mobile validates against schemas
5. OpenAPI specs generated from schemas

Never let implementation drive the contract.

## Versioning

### Breaking Changes

Breaking changes require versioned routes:

```
/v1/jobs        → Original version
/v2/jobs        → Breaking change (new required field)
```

Breaking changes include:
- Removing fields
- Changing field types
- Adding required fields
- Changing validation rules (stricter)
- Renaming fields

### Non-Breaking Changes

Non-breaking changes can be made to existing routes:
- Adding optional fields
- Relaxing validation rules
- Adding new enum values (if consumers handle unknown values)

### Version Format

Use `/v{n}` prefix in route paths:

```typescript
// shared/routes.manifest.ts
export const ROUTES = {
  v1: {
    createJob: '/v1/jobs',
    getJob: '/v1/jobs/:id',
  },
  v2: {
    createJob: '/v2/jobs',
    getJob: '/v2/jobs/:id',
  },
} as const;
```

## Framework Independence

The shared package must remain framework-agnostic:

**Allowed:**
- Zod schemas
- TypeScript types
- Pure utility functions
- Constants and enums

**Forbidden:**
- React imports
- AWS SDK imports
- Node.js-specific APIs (use isomorphic alternatives)
- Any framework-specific code

Rationale: Shared code must work in browser, Node.js, and edge runtimes.

## Tooling

### API Extractor

Use `@microsoft/api-extractor` for public API validation:

```json
{
  "mainEntryPointFilePath": "./dist/index.d.ts",
  "apiReport": {
    "enabled": true,
    "reportFolder": "./api-reports/"
  }
}
```

Any change to public API requires review and approval.

### Contract Validation

Fitness function: `pnpm turbo run contracts:check --filter=@photoeditor/shared`

Validates:
- No framework imports
- No breaking changes without version bump
- All schemas exportable
- Types match schemas

## Schema Patterns

### Request/Response Pairs

```typescript
// Request schema
export const CreateJobRequestSchema = z.object({
  fileName: z.string(),
  contentType: z.string(),
  operations: z.array(OperationSchema),
});

// Response schema
export const CreateJobResponseSchema = z.object({
  jobId: z.string(),
  uploadUrl: z.string(),
  expiresAt: z.string().datetime(),
});

// Inferred types
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;
export type CreateJobResponse = z.infer<typeof CreateJobResponseSchema>;
```

### Reusable Components

```typescript
// Common fields
const TimestampFields = z.object({
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

// Composed schema
export const JobSchema = z.object({
  id: z.string(),
  status: JobStatusSchema,
  fileName: z.string(),
}).merge(TimestampFields);
```

## Documentation

- Every schema must have JSDoc comments
- Complex validation rules explained
- Examples for non-obvious schemas
- Migration guides for breaking changes
