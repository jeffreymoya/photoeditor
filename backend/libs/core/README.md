# Backend Core Library

> **Purpose**: Shared core library for backend services and workers. Provides reusable modules for AWS clients, configuration, providers, and reliability patterns.

## Responsibility

The core library consolidates duplicated wiring across the Nest BFF and standalone Lambda workers, providing:

1. **AWS Client Factories** - Region-aware SDK client creation shared across runtimes
2. **Configuration Service** - Centralized SSM Parameter Store access
3. **Provider Management** - Factory pattern for AI provider instantiation (real + stub)
4. **Idempotency** - Conditional write patterns for duplicate message detection
5. **DLQ Utilities** - Dead letter queue inspection and replay tools

## Architecture

```
@backend/core
├── aws/              # AWS SDK client factories
├── config/           # Configuration service (SSM)
├── providers/        # Provider factory, bootstrap, creator adapter
└── idempotency/      # Idempotency service, DLQ utilities
```

## Usage

### AWS Clients

```typescript
import { createS3Client, createDynamoDBClient } from '@backend/core';

const s3 = createS3Client('us-east-1');
const dynamo = createDynamoDBClient('us-east-1');
```

### Configuration

```typescript
import { createSSMClient, ConfigService } from '@backend/core';

const ssmClient = createSSMClient('us-east-1');
const config = new ConfigService(ssmClient, 'project', 'prod');

const apiKey = await config.getGeminiApiKey();
```

### Provider Initialization

```typescript
import {
  createSSMClient,
  ConfigService,
  BootstrapService,
  StandardProviderCreator
} from '@backend/core';

const ssmClient = createSSMClient('us-east-1');
const config = new ConfigService(ssmClient, 'project', 'dev');
const creator = new StandardProviderCreator();
const bootstrap = new BootstrapService(config, creator);

const factory = await bootstrap.initializeProviders();
const analysisProvider = factory.getAnalysisProvider();
const editingProvider = factory.getEditingProvider();
```

### Idempotency

```typescript
import { createDynamoDBClient, IdempotencyService } from '@backend/core';

const client = createDynamoDBClient('us-east-1');
const idempotency = new IdempotencyService(client, 'idempotency-table');

const key = `job:${jobId}`;
const acquired = await idempotency.tryAcquireLock(key);

if (acquired) {
  // First processing - do work
  await processJob(jobId);
  await idempotency.markCompleted(key, result);
} else {
  // Duplicate - skip processing
  const record = await idempotency.getRecord(key);
  if (record.status === 'completed') {
    return record.result;
  }
}
```

### DLQ Management

```typescript
import { createSQSClient, DLQService } from '@backend/core';
import { Logger } from '@aws-lambda-powertools/logger';

const client = createSQSClient('us-east-1');
const logger = new Logger();
const dlq = new DLQService(client, 'dlq-url', logger);

// Inspect failed messages
const messages = await dlq.receiveMessages(10);

// Replay a message to source queue
for (const msg of messages) {
  await dlq.replayMessage(msg, 'source-queue-url');
}

// Check DLQ depth
const count = await dlq.getApproximateMessageCount();
```

## Invariants

1. **No Direct SDK Construction** - All AWS clients must be created via factory functions
2. **No Mutable Singletons** - Stateless factories; dependencies injected via constructors
3. **Framework Agnostic** - Core library has no Nest-specific dependencies; supports pure Lambda execution
4. **Configuration from SSM** - All provider configuration loaded from Parameter Store, no hardcoded secrets

## Edge Cases

### Stub Providers

Enable stub providers for testing without real API calls:

```bash
# In SSM Parameter Store
aws ssm put-parameter \
  --name "/project-dev/providers/enable-stubs" \
  --value "true" \
  --type String
```

### Idempotency TTL

Idempotency keys expire after 24 hours (configurable):

```typescript
const idempotency = new IdempotencyService(client, 'table', 48); // 48h TTL
```

DynamoDB TTL attribute `expiresAt` must be enabled on the table.

### Provider Swap

Switch providers via SSM without code changes:

```bash
aws ssm put-parameter \
  --name "/project-prod/providers/analysis" \
  --value "gemini" \
  --type String
```

Valid values: `gemini` (analysis), `seedream` (editing), `stub` (both)

## Local Testing

### Unit Tests

```bash
pnpm turbo run test --filter=@photoeditor/backend -- libs/core
```

### Contract Tests

Validate API contracts:

```bash
pnpm turbo run test:contract --filter=@photoeditor/backend
```

## Related ADRs

- **ADR-0004**: AWS Client Factory Pattern
- **ADR-0006**: Secrets Management Strategy

## Compliance

- **No handler AWS SDK imports** - Enforced by dependency-cruiser
- **No mutable singleton state** - Providers injected via constructor
- **Single source of truth for configuration** - SSM Parameter Store
- **Idempotent worker execution** - Conditional writes
- **DLQ retry support** - Replay utilities

## Module Metrics

- **Lines of Code**: ~500 (excluding tests)
- **Cyclomatic Complexity**: ≤8 per function
- **Fan-in**: ≤15 (imported by BFF and workers)
- **Fan-out**: ≤12 (imports AWS SDK, shared contracts)
- **Test Coverage**: Lines ≥80%, Branch ≥70%

## Migration Notes

Services migrating from `src/libs/aws-clients.ts` or `src/services/{config,bootstrap}.service.ts`:

1. Update imports: `import { createS3Client } from '@backend/core';`
2. ConfigService now requires SSM client injection: `new ConfigService(ssmClient, project, env)`
3. BootstrapService requires ProviderCreator: `new BootstrapService(config, new StandardProviderCreator())`
4. ProviderFactory no longer uses singleton pattern - instantiate per request or cache at app init
