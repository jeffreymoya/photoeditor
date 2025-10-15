# PhotoEditor Stage 1 Architecture

**Version:** 1.0.0
**Last Updated:** 2025-10-05
**Status:** Stage 1 (Early Stage - ISO/IEC 25010 Maintainability Focus)
**Related:** docs/architecure-refactor-plan.md, docs/rubric.md, STANDARDS.md

## Overview

PhotoEditor is a TypeScript monorepo implementing a hybrid serverless architecture for AI-powered image processing. The platform separates synchronous mobile-facing APIs from asynchronous event-driven processing pipelines to optimize for cost, scalability, and maintainability.

## High-Level Architecture

```
┌─────────────────┐
│  React Native   │
│   Mobile App    │
└────────┬────────┘
         │ HTTPS (API Gateway)
         │
         ▼
┌─────────────────────────────────┐
│    API Gateway (HTTP API)        │
│                                  │
│  Routes:                         │
│   POST /v1/upload/presign        │
│   GET  /v1/jobs/{id}             │
│   GET  /v1/jobs/{id}/download    │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│    NestJS BFF (Lambda)           │
│                                  │
│  Modules:                        │
│   - PresignModule                │
│   - JobModule                    │
│   - ObservabilityModule          │
└─────┬───────┬───────────────────┘
      │       │
      │       └──────────┐
      │                  │
      ▼                  ▼
┌──────────┐      ┌──────────────┐
│ DynamoDB │      │ S3 (Presign) │
│  jobs    │      │ Temp Bucket  │
└──────────┘      └──────┬───────┘
                         │ ObjectCreated Event
                         ▼
                  ┌──────────────┐
                  │  SQS Queue   │
                  └──────┬───────┘
                         │
                         ▼
                  ┌─────────────────────┐
                  │  Worker Lambda       │
                  │  (image-processor)   │
                  │                      │
                  │  1. Get S3 Object    │
                  │  2. Call Provider    │
                  │  3. Update DynamoDB  │
                  │  4. Publish SNS      │
                  └─┬────────┬──────┬───┘
                    │        │      │
                    │        │      └──────────┐
                    │        │                 │
                    ▼        ▼                 ▼
           ┌──────────┐  ┌─────────┐    ┌──────────┐
           │ Provider │  │ S3 Final│    │   SNS    │
           │ (Gemini/ │  │ Bucket  │    │  Topic   │
           │ Seedream)│  └─────────┘    └────┬─────┘
           └──────────┘                      │
                                             ▼
                                        ┌─────────┐
                                        │   FCM   │
                                        │ (Mobile)│
                                        └─────────┘
```

## Core Principles

Per STANDARDS.md and docs/architecure-refactor-plan.md:

1. **Contract-First API:** Shared Zod schemas (` packages/contracts`) prevent drift (ADR-0003, ADR-0005)
2. **Layered Architecture:** Handlers → Services → Adapters (STANDARDS.md line 24)
3. **Provider Abstraction:** AI providers behind interfaces for portability (ADR-0004)
4. **Event-Driven Processing:** S3 → SQS → Worker for asynchronous jobs
5. **Observability:** Structured logs, W3C traceparent, X-Ray tracing (STANDARDS.md lines 71-73)

## Module Organization

```
photoeditor/
├── apps/
│   ├── mobile/          # React Native (Expo)
│   ├── api/             # NestJS BFF (future)
│   └── workers/         # Lambda handlers
├── packages/
│   ├── contracts/       # Zod schemas, shared types
│   ├── fp-core/         # Functional utilities
│   ├── error/           # Error taxonomy
│   ├── observability/   # Logging, tracing helpers
│   └── testing/         # Test utilities, mocks
├── infrastructure/
│   └── terraform/       # IaC modules
└── docs/
    ├── architecture/    # This directory
    ├── ops/runbooks/    # Operational procedures
    ├── evidence/        # Compliance artifacts
    └── adr/             # Architecture decisions
```

See [Module Boundaries](./modules.md) and [Layer Constraints](./layers.md) for detailed dependency rules.

## Component Descriptions

### Mobile App (React Native)

**Purpose:** User-facing iOS/Android application for photo upload and result viewing

**Key Features:**
- Camera capture and photo picker integration
- Image preprocessing (resize to ≤4096px, HEIC→JPEG conversion)
- Background upload with retry/resume (exponential backoff)
- Offline support via react-query persistence
- Push notifications (FCM)

**Tech Stack:**
- React Native with Expo
- TypeScript strict mode
- Redux Toolkit for client state
- react-query for server state
- react-hook-form + zod for validation
- react-native-vision-camera for capture

**Navigation Structure:**
```
Stack Navigator
├── Auth Flow (future)
├── Home (Tab Navigator)
│   ├── Upload Tab
│   ├── Jobs Tab
│   └── Settings Tab
└── Job Detail Screen
```

**Evidence:**
- See `docs/evidence/architecture/modules.md` for feature boundaries
- See `mobile/app/` for folder structure

### API Gateway (HTTP API)

**Purpose:** Entry point for mobile clients with rate limiting and CORS

**Configuration:**
- HTTP API v2 (lower latency than REST API)
- JWT validation (future - Cognito/Auth0)
- Rate limiting: 10,000 req/sec account-level, per-route limits
- CORS: configured for mobile app origins
- Access logs: JSON format with traceId

**Routes:**
- `POST /v1/upload/presign` → Presign handler
- `GET /v1/jobs/{id}` → Status handler
- `GET /v1/jobs/{id}/download` → Download handler

**Evidence:**
- See `infrastructure/terraform/modules/api-gateway/`

### BFF Lambda (NestJS)

**Purpose:** Thin orchestration layer for API routes

**Modules:**
- **PresignModule:** Generates S3 presigned POST URLs, creates job record
- **JobModule:** Queries job status, generates download presigned GET URLs
- **ObservabilityModule:** Logging interceptor, correlation ID injection

**Performance:**
- Memory: 256 MB
- Timeout: 10s
- Cold start P95: 245ms (target: ≤300ms per STANDARDS.md line 127)
- Warm latency P95: 78ms (target: ≤120ms per refactor plan)

**Evidence:**
- See `docs/evidence/observability/performance-tuning.md`

### Worker Lambdas

#### Image Processor

**Purpose:** Process uploaded images via AI provider APIs

**Flow:**
1. Triggered by SQS message (from S3 ObjectCreated event)
2. Download image from S3 temp bucket
3. Call provider API (Gemini/Seedream/Stub) for analysis/editing
4. Upload result to S3 final bucket
5. Update DynamoDB job status (PROCESSING → EDITING → COMPLETED/FAILED)
6. Publish SNS notification

**Performance:**
- Memory: 1024 MB
- Timeout: 30s
- Reserved concurrency: 100
- P95 duration: 4.2s (target: ≤6s per refactor plan)

**Retry Policy:**
- SQS visibility timeout: 30s (6× avg processing time per STANDARDS.md line 121)
- Max receive count: 3 (DLQ after 3 failures)
- Idempotency: Conditional DynamoDB writes with jobId key

**Evidence:**
- See `backend/workers/image-processor/`
- See `docs/ops/runbooks/dlq-replay.md`

### DynamoDB (jobs table)

**Purpose:** Job metadata and status tracking

**Schema:**
```typescript
interface Job {
  jobId: string;              // Partition key (ULID)
  userId: string;             // GSI partition key
  status: JobStatus;          // QUEUED | PROCESSING | EDITING | COMPLETED | FAILED
  createdAt: number;          // Timestamp (GSI sort key)
  updatedAt: number;
  fileSize: number;
  fileType: string;
  provider: string;           // gemini | seedream | stub
  s3TempKey?: string;
  s3FinalKey?: string;
  error?: ErrorDetails;
  ttl: number;                // 90 days from creation
}
```

**Indexes:**
- Primary: `jobId` (partition key)
- GSI1: `userId` (partition), `createdAt` (sort) - for user job history
- GSI2: `status` (partition), `createdAt` (sort) - for admin queries

**Configuration:**
- Billing: On-demand (dev/staging), Provisioned with auto-scaling (prod planned)
- PITR: Enabled
- Encryption: AWS-managed KMS
- TTL: 90 days

**Evidence:**
- See `docs/data-model/jobs-table.md`

### S3 Buckets

#### Temp Bucket
- **Purpose:** Upload staging area
- **Lifecycle:** Delete after 48 hours
- **Encryption:** SSE-S3
- **Versioning:** Disabled
- **Block Public Access:** Enabled

#### Final Bucket
- **Purpose:** Processed results storage
- **Lifecycle:** Transition to Intelligent-Tiering at 30 days
- **Encryption:** SSE-KMS (CMK per environment)
- **Versioning:** Enabled
- **Block Public Access:** Enabled
- **Transfer Acceleration:** Enabled

**Evidence:**
- See `docs/evidence/security/s3-block-public.md`

### SQS Queues

#### image-processing-queue
- **Visibility timeout:** 30s
- **Message retention:** 4 days
- **Long polling:** 20s
- **Batch size:** 10
- **DLQ:** image-processing-dlq (max receive count: 3)

#### image-processing-dlq
- **Purpose:** Failed messages after 3 retries
- **Retention:** 14 days
- **Alarm:** DLQ inflow >0 for 5m (STANDARDS.md line 80)

**Evidence:**
- See `docs/ops/runbooks/dlq-replay.md`

### Provider Abstraction

**Interface:**
```typescript
interface ProviderStrategy {
  analyze(image: Buffer): Promise<AnalysisResult>;
  edit(image: Buffer, params: EditParams): Promise<EditResult>;
}
```

**Implementations:**
- **GeminiProvider:** Google Gemini API (production)
- **SeedreamProvider:** Seedream API (alternative)
- **StubProvider:** In-memory mock (testing/degradation)

**Selection:** Via SSM Parameter Store `/photoeditor/{env}/provider/strategy`

**Evidence:**
- See ADR-0004 (AWS Client Factory Pattern)
- See `docs/ops/runbooks/provider-swap.md`
- See `docs/evidence/provider-swap.md`

## Security

Per STANDARDS.md and docs/rubric.md:

- **IAM:** Least privilege, resource-scoped policies
- **Encryption:** S3 SSE-KMS (final), DynamoDB at-rest, SQS SSE
- **Secrets:** SSM SecureString + Secrets Manager (ADR-0006)
- **AuthN:** GitHub OIDC for CI/CD (no long-lived credentials)
- **AuthZ:** API Gateway JWT validation (future)
- **Audit:** CloudTrail enabled, CloudWatch Logs retention 90d (prod)

**Evidence:**
- See `docs/evidence/security/`
- See ADR-0006 (Secrets Management Strategy)

## Observability

Per STANDARDS.md lines 71-73, 74-81:

- **Structured Logs:** correlationId, traceId, requestId, jobId, userId, function, env, version
- **Tracing:** X-Ray with W3C traceparent propagation
- **Metrics:** CloudWatch custom metrics via EMF
- **Alarms:** Lambda errors, API 5XX, SQS age, DLQ inflow, DynamoDB errors
- **Dashboards:** Job processing overview, API performance, queue health
- **Retention:** Prod 90d, Staging 30d, Dev 14d

**Evidence:**
- See `docs/evidence/observability/cloudwatch-dashboards.md`
- See `docs/evidence/observability/logs-insights-queries.md`
- See `docs/evidence/observability/xray-traces.md`
- See `docs/ops/runbooks/alarm-triage.md`

## Cost Attribution

Per STANDARDS.md line 44, all resources tagged:

- `Project`: photoeditor
- `Env`: dev | staging | prod
- `Owner`: platform-team
- `CostCenter`: engineering

**Current Monthly Cost (Staging, 50k jobs):**
- Lambda (BFF + Workers): $57.50
- DynamoDB: $8
- SQS: $7
- S3: $18
- API Gateway: $15
- **Total:** ~$105.50/month

**Evidence:**
- See `docs/evidence/observability/performance-tuning.md`

## Deployment

### Environments
- **Dev:** LocalStack (emulated) + SST (live AWS dev)
- **Staging:** AWS (Terraform)
- **Production:** AWS (Terraform, manual approval)

### CI/CD
- **GitHub Actions** with OIDC (no credentials stored)
- **Pipeline:** Typecheck → Lint → Test → Build → Deploy (Terraform)
- **Gates:** dependency-cruiser, contract-check, coverage, security scans

**Evidence:**
- See `.github/workflows/`
- See `infrastructure/terraform/`

## Performance Baselines

Per `docs/architecure-refactor-plan.md`:

| Metric | Target | Current (Staging) | Status |
|--------|--------|-------------------|--------|
| Presign P95 | ≤120ms | 95ms | ✅ |
| Status Read P95 | ≤80ms | 62ms | ✅ |
| Worker P95 | ≤6s | 4.2s | ✅ |
| Cold Start P95 | ≤300ms | 245ms | ✅ |
| Job Failure Rate | ≤1% | 0.3% | ✅ |

**Evidence:**
- See `docs/evidence/observability/performance-tuning.md`

## Related Documents

- [Module Boundaries](./modules.md)
- [Layer Constraints](./layers.md)
- [Data Model](../data-model/jobs-table.md)
- [API Contracts](../api/contracts.md)
- [Architecture Refactor Plan](../architecure-refactor-plan.md)
- [Stage 1 Rubric](../rubric.md)
- [STANDARDS.md](../../STANDARDS.md)
- ADRs: 0001 (TypeScript Monorepo), 0002 (Serverless Pipeline), 0003 (Contract-First API), 0004 (AWS Client Factory), 0005 (npm Workspaces), 0006 (Secrets Management)

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-10-05 | Platform Team | Initial Stage 1 architecture documentation |
