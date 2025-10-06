# DynamoDB Jobs Table Schema

**Table Name:** `photoeditor-{env}-jobs`
**Last Updated:** 2025-10-05
**Related:** docs/architecture/README.md, STANDARDS.md (lines 189-193)

## Table Configuration

- **Billing Mode:** On-demand (dev/staging), Provisioned with auto-scaling (prod planned)
- **Partition Key:** `jobId` (String)
- **PITR:** Enabled
- **Encryption:** AWS-managed KMS
- **TTL Attribute:** `ttl` (90 days from creation)
- **Streams:** Disabled (future: enable for analytics)

## Item Schema

```typescript
interface JobItem {
  // Primary Key
  jobId: string;                    // ULID format (e.g., "01HF9GXXX...")

  // User Info
  userId: string;                   // User identifier

  // Status Tracking
  status: JobStatus;                // QUEUED | PROCESSING | EDITING | COMPLETED | FAILED
  createdAt: number;                // Unix timestamp (milliseconds)
  updatedAt: number;                // Unix timestamp (milliseconds)

  // File Metadata
  fileSize: number;                 // Bytes
  fileType: string;                 // MIME type (e.g., "image/jpeg")
  originalFileName?: string;        // Original upload filename

  // S3 References
  s3TempKey?: string;               // Key in temp bucket
  s3FinalKey?: string;              // Key in final bucket (after processing)

  // Processing Details
  provider: string;                 // gemini | seedream | stub
  processingStartedAt?: number;     // Unix timestamp
  processingCompletedAt?: number;   // Unix timestamp

  // Results
  analysisResult?: AnalysisResult;  // Provider analysis output (JSON)
  editResult?: EditResult;          // Provider edit output (JSON)

  // Error Tracking
  error?: {
    code: string;                   // Error code (e.g., "PROVIDER_TIMEOUT")
    message: string;                // Human-readable error
    stack?: string;                 // Stack trace (dev/staging only)
    retryCount: number;             // Number of retries attempted
  };

  // Metadata
  correlationId?: string;           // Request correlation ID
  traceId?: string;                 // X-Ray trace ID

  // TTL (Auto-delete)
  ttl: number;                      // Unix timestamp (90 days from creation)
}
```

### JobStatus Enum

```typescript
enum JobStatus {
  QUEUED = 'QUEUED',           // Job created, waiting for processing
  PROCESSING = 'PROCESSING',   // Worker Lambda fetching from S3
  EDITING = 'EDITING',         // Provider API call in progress
  COMPLETED = 'COMPLETED',     // Successfully processed
  FAILED = 'FAILED',           // Failed after retries
}
```

### AnalysisResult

```typescript
interface AnalysisResult {
  labels: Array<{
    name: string;
    confidence: number;        // 0.0 - 1.0
  }>;
  description?: string;
  safeSearch?: {
    adult: string;             // "VERY_UNLIKELY" | "UNLIKELY" | "POSSIBLE" | "LIKELY" | "VERY_LIKELY"
    violence: string;
  };
}
```

### EditResult

```typescript
interface EditResult {
  s3Key: string;                 // Key in final bucket
  width: number;
  height: number;
  format: string;                // "jpeg" | "png" | "webp"
  size: number;                  // Bytes
}
```

## Global Secondary Indexes

### GSI1: User Job History
- **Index Name:** `userId-createdAt-index`
- **Partition Key:** `userId` (String)
- **Sort Key:** `createdAt` (Number)
- **Projection:** ALL
- **Use Case:** Query all jobs for a user, ordered by creation time

**Query Pattern:**
```typescript
await dynamodb.query({
  TableName: 'photoeditor-prod-jobs',
  IndexName: 'userId-createdAt-index',
  KeyConditionExpression: 'userId = :userId',
  ExpressionAttributeValues: {
    ':userId': 'user-12345',
  },
  ScanIndexForward: false,  // Descending order (newest first)
  Limit: 20,
});
```

### GSI2: Status-Based Queries (Admin)
- **Index Name:** `status-createdAt-index`
- **Partition Key:** `status` (String)
- **Sort Key:** `createdAt` (Number)
- **Projection:** ALL
- **Use Case:** Admin queries for jobs by status (e.g., all FAILED jobs)

**Query Pattern:**
```typescript
await dynamodb.query({
  TableName: 'photoeditor-prod-jobs',
  IndexName: 'status-createdAt-index',
  KeyConditionExpression: 'status = :status',
  ExpressionAttributeValues: {
    ':status': 'FAILED',
  },
  ScanIndexForward: false,
  Limit: 100,
});
```

## Access Patterns

| Use Case | Operation | Key/Index |
|----------|-----------|-----------|
| Get job by ID | GetItem | `jobId` (primary key) |
| List user jobs | Query | `userId-createdAt-index` (GSI1) |
| List failed jobs | Query | `status-createdAt-index` (GSI2) |
| Update job status | UpdateItem | `jobId` (primary key) |
| Delete job | DeleteItem | `jobId` (primary key) |

## Status Transitions

```
QUEUED ──────> PROCESSING ──────> EDITING ──────> COMPLETED
                                      │
                                      └──────────> FAILED
```

**Transition Rules:**
- QUEUED → PROCESSING: Worker Lambda starts processing
- PROCESSING → EDITING: Provider API call initiated
- EDITING → COMPLETED: Provider API success
- EDITING → FAILED: Provider API error or max retries exceeded
- FAILED (DLQ): Manual replay or investigation required

## Idempotency

Per STANDARDS.md line 102, workers use conditional writes:

```typescript
await dynamodb.updateItem({
  TableName: 'photoeditor-prod-jobs',
  Key: { jobId: 'job-12345' },
  UpdateExpression: 'SET #status = :newStatus, updatedAt = :now',
  ConditionExpression: '#status = :expectedStatus',
  ExpressionAttributeNames: {
    '#status': 'status',
  },
  ExpressionAttributeValues: {
    ':newStatus': 'PROCESSING',
    ':expectedStatus': 'QUEUED',
    ':now': Date.now(),
  },
});
```

If condition fails (job already processed), idempotency is maintained.

## TTL Configuration

```hcl
resource "aws_dynamodb_table" "jobs" {
  name           = "photoeditor-${var.environment}-jobs"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "jobId"

  attribute {
    name = "jobId"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(local.common_tags, {
    Name = "photoeditor-${var.environment}-jobs"
  })
}
```

**TTL Calculation:**
```typescript
const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60); // 90 days
```

## Capacity Planning

### On-Demand (Dev/Staging)
- No capacity planning required
- Auto-scales to demand
- Cost: ~$8/month for 50k jobs

### Provisioned (Production - Planned)
- Base RCU: 25, WCU: 10
- Auto-scaling: RCU 25-100, WCU 10-50
- Target utilization: 70%
- Estimated cost: $25/month for 100k jobs

## Data Retention

- **Active jobs:** Until TTL expires (90 days)
- **PITR:** 35 days (DynamoDB default)
- **Backups:** On-demand backups retained 1 year (compliance requirement - future)

## Migration Playbook

Per STANDARDS.md line 192, forward-safe migration steps:

1. **Adding a field:**
   - Add as optional field in schema
   - Update write path to include field
   - Backfill existing items if needed
   - Update read path to handle null/undefined

2. **Renaming a field:**
   - Add new field alongside old field
   - Dual-write to both fields
   - Migrate read path to new field
   - Backfill old items
   - Stop writing to old field
   - Remove old field from schema

3. **Removing a field:**
   - Stop writing to field
   - Update read path to ignore field
   - Optional: Backfill to remove field from items

## Related Documents

- [Architecture Overview](../architecture/README.md)
- [API Contracts](../api/contracts.md)
- STANDARDS.md (lines 189-193: Database Standards)
- docs/rubric.md (line 241: Data Model Requirement)
