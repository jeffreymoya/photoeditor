# ADR 0004: AWS Client Factory Pattern for Environment-Aware Endpoint Configuration

- Status: Accepted
- Date: 2025-10-04

## Context

STANDARDS.md enforces strict dependency layering (handlers → services → adapters) and mandates that services and handlers must not directly instantiate AWS SDK clients (`STANDARDS.md:25,32`). The codebase must support both production AWS endpoints and LocalStack endpoints for local development, requiring consistent endpoint configuration across all AWS services (S3, DynamoDB, SQS, SNS). Existing services directly construct clients with `new S3Client()`, `new DynamoDBClient()`, etc., violating the adapter layer principle and creating inconsistent endpoint handling. The architecture refactor plan (Phase 0) requires an endpoint-aware factory that provides reusable, testable AWS clients with LocalStack support (`tasks/backend/TASK-0100-phase0-foundations.task.yaml:104-111`).

## Decision

Implement a centralized AWS client factory (`backend/libs/aws-clients.ts`) that provides factory functions for creating S3, DynamoDB, SQS, and SNS clients. The factory detects the environment (`LOCALSTACK_ENDPOINT` or `AWS_ENDPOINT_URL` environment variables) and configures clients accordingly. Services must use these factory functions instead of direct client construction. The factory supports custom configuration overrides while maintaining consistent endpoint and region defaults.

**Key Design Elements**:
- Factory functions: `createS3Client()`, `createDynamoDBClient()`, `createSQSClient()`, `createSNSClient()`
- Environment detection: `getAWSEnvironment()` checks for LocalStack or custom endpoints
- LocalStack support: S3 clients automatically enable `forcePathStyle` when LocalStack is detected
- Region defaulting: Uses `AWS_REGION` environment variable or defaults to `us-east-1`
- Custom overrides: Factory functions accept optional config objects for service-specific settings
- Comprehensive testing: 24 unit tests cover all endpoint scenarios and configuration options

## Consequences

**Positive**:
- Eliminates STANDARDS.md hard fail violation (no direct SDK construction in services/handlers)
- Provides single source of truth for AWS client configuration
- Enables seamless LocalStack support without code changes (environment variable only)
- Improves testability through dependency injection (services can receive pre-configured clients)
- Establishes clear adapter layer boundary between business logic and infrastructure
- Extensible for future AWS services (Secrets Manager, SSM, EventBridge, etc.)
- Reduces configuration duplication across services

**Negative**:
- Requires refactoring existing services to migrate from `new XClient()` to factory functions
- Adds one additional abstraction layer between services and AWS SDK
- Services must import factory module, creating new dependency
- Developers must learn factory pattern instead of direct instantiation

**Neutral**:
- Pattern is simple and familiar (factory pattern is well-understood)
- Migration path is straightforward (replace constructor calls with factory calls)

## Alternatives Considered

**1. Dependency Injection Container (e.g., InversifyJS)**
- Pros: Industry-standard pattern, supports complex dependency graphs, automatic resolution
- Cons: Heavy dependency, steep learning curve, overkill for current scope, requires extensive refactoring
- Rejected: Too heavyweight for current needs; factory pattern provides sufficient abstraction

**2. Service-Level Client Management**
- Pros: Each service manages its own client configuration
- Cons: Inconsistent endpoint handling, duplicated configuration logic, no single source of truth
- Rejected: Violates DRY principle and creates maintenance burden

**3. Global Singleton Clients**
- Pros: Simple, minimal code changes
- Cons: Poor testability, concurrency concerns, violates dependency injection principles
- Rejected: Hinders unit testing and creates tight coupling

**4. Higher-Order Service Wrappers**
- Pros: Could wrap entire service classes with AWS client injection
- Cons: Complex implementation, obscures service interfaces, harder to understand
- Rejected: Adds unnecessary complexity compared to factory pattern

## Implementation Notes

**Migration Strategy**:
1. Created factory in `backend/libs/aws-clients.ts` with comprehensive tests (`backend/tests/libs/aws-clients.test.ts`)
2. Identified services requiring migration: S3Service, JobService, NotificationService, DeviceTokenService
3. Migration involves replacing `new XClient({ region })` with `createXClient(region)` in constructor
4. Services can continue accepting region parameter or rely on factory defaults
5. Tests should verify correct factory usage with mocked clients

**Verification**:
- Grep validation: `! grep -r 'new S3Client\|new DynamoDBClient\|new SQSClient\|new SNSClient' backend/src/services/`
- Dependency-cruiser: No violations after migration
- Unit tests: Factory tests passing (24/24)

## Related Work

- Adapter layer requirements and dependency policy (`STANDARDS.md:24-25,32`)
- Phase 0 foundations task specification (`tasks/backend/TASK-0100-phase0-foundations.task.yaml:104-111`)
- AWS client factory implementation (`backend/libs/aws-clients.ts:1-177`)
- Factory unit tests (`backend/tests/libs/aws-clients.test.ts:1-238`)
- Implementation changelog (`changelog/2025-10-04-phase0-foundations-gates.md:1-250`)
- Evidence artifacts (`docs/evidence/TASK-0100-phase0-foundations.md:1-155`)
- Existing services to migrate:
  - `backend/src/services/s3.service.ts:48` (S3Client)
  - `backend/src/services/job.service.ts:14` (DynamoDBClient)
  - `backend/src/services/notification.service.ts:25` (SNSClient)
  - `backend/src/services/deviceToken.service.ts:21` (DynamoDBClient)
