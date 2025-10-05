# Changelog - @photoeditor/backend

All notable changes to this package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- docs/testing-standards.md
