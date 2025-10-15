# API Contract Documentation

**Version:** 1.0.0
**Last Updated:** 2025-10-11
**Base URL:** `https://api.photoeditor.com` (prod), `https://api-staging.photoeditor.com` (staging)
**Related:** ADR-0003 (Contract-First API), ADR-0005 (npm Workspaces), standards/shared-contracts-tier.md, STANDARDS.md (lines 40, 87-88, 145-146)

## Overview

PhotoEditor API follows contract-first design with Zod schemas in `shared/schemas/` and route definitions in `shared/routes.manifest.ts`. All requests/responses are validated against these schemas to prevent drift between mobile and backend.

### Contract Generation Pipeline

Per ADR-0003 and TASK-0602, the API contract generation follows this workflow:

1. **Source of Truth**: Zod schemas (`shared/schemas/`) + Routes manifest (`shared/routes.manifest.ts`)
2. **Generation**: `npm run contracts:generate` produces:
   - OpenAPI spec (`docs/openapi/openapi-generated.yaml`) with populated `paths`
   - TypeScript types (`docs/contracts/clients/types.ts`)
   - API client (`docs/contracts/clients/photoeditor-api.ts`)
3. **Validation**: `npm run contracts:check` detects drift
4. **CI Enforcement**: Route alignment checked via `scripts/ci/check-route-alignment.sh`

### Registering New Routes

To add a new API endpoint:

1. Define Zod request/response schemas in `shared/schemas/api.schema.ts`
2. Add route entry to `shared/routes.manifest.ts`:
   ```typescript
   {
     method: 'POST',
     path: '/v1/your-endpoint',
     handler: 'yourHandler',
     operationId: 'yourOperation',
     summary: 'Short description',
     description: 'Detailed description',
     requestSchema: YourRequestSchema,
     responseSchema: YourResponseSchema,
     tags: ['YourTag'],
   }
   ```
3. Regenerate contracts: `npm run contracts:generate --prefix shared`
4. Update Terraform to wire Lambda handler to the route
5. Verify alignment: `scripts/ci/check-route-alignment.sh`

## Authentication

**Current:** None (public API for MVP)
**Future:** JWT via API Gateway Cognito/Auth0 authorizer

## Error Model

All errors follow consistent format:

```typescript
interface ErrorResponse {
  error: {
    code: string;           // Machine-readable error code
    message: string;        // Human-readable error message
    details?: unknown;      // Optional additional context
    traceId?: string;       // X-Ray trace ID for debugging
  };
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `JOB_NOT_FOUND` | 404 | Job ID does not exist |
| `FILE_TOO_LARGE` | 413 | File exceeds 50MB limit |
| `UNSUPPORTED_FILE_TYPE` | 415 | File type not supported |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `PROVIDER_TIMEOUT` | 504 | Provider API timeout |

## Endpoints

### POST /v1/upload/presign

Create a new job and get S3 presigned POST URL for file upload.

**Request:**

```typescript
interface PresignRequest {
  userId: string;           // User identifier
  fileSize: number;         // File size in bytes (max: 52428800 = 50MB)
  fileType: string;         // MIME type (image/jpeg, image/png, image/heic)
  fileName?: string;        // Original filename (optional)
}
```

**Response (200):**

```typescript
interface PresignResponse {
  jobId: string;            // Job identifier (ULID)
  uploadUrl: string;        // S3 presigned POST URL
  uploadFields: {           // Form fields for S3 POST
    key: string;
    bucket: string;
    'X-Amz-Algorithm': string;
    'X-Amz-Credential': string;
    'X-Amz-Date': string;
    'X-Amz-Signature': string;
    Policy: string;
  };
  expiresAt: number;        // Unix timestamp (upload URL expiry)
}
```

**Example:**

```bash
curl -X POST https://api-staging.photoeditor.com/v1/upload/presign \
  -H "Content-Type: application/json" \
  -H "X-Correlation-Id: req-abc123" \
  -d '{
    "userId": "user-12345",
    "fileSize": 2048576,
    "fileType": "image/jpeg"
  }'
```

**Upload to S3:**

```bash
curl -X POST "${uploadUrl}" \
  -F "key=${uploadFields.key}" \
  -F "bucket=${uploadFields.bucket}" \
  -F "X-Amz-Algorithm=${uploadFields['X-Amz-Algorithm']}" \
  -F "X-Amz-Credential=${uploadFields['X-Amz-Credential']}" \
  -F "X-Amz-Date=${uploadFields['X-Amz-Date']}" \
  -F "Policy=${uploadFields.Policy}" \
  -F "X-Amz-Signature=${uploadFields['X-Amz-Signature']}" \
  -F "file=@photo.jpg"
```

**Errors:**

- `400 VALIDATION_ERROR`: Invalid request body
- `413 FILE_TOO_LARGE`: fileSize > 50MB
- `415 UNSUPPORTED_FILE_TYPE`: fileType not in allowed list
- `429 RATE_LIMIT_EXCEEDED`: >1000 requests/sec per user
- `500 INTERNAL_ERROR`: S3/DynamoDB failure

---

### GET /v1/jobs/{jobId}

Get job status and result.

**Path Parameters:**
- `jobId` (required): Job identifier

**Response (200):**

```typescript
interface JobStatusResponse {
  jobId: string;
  userId: string;
  status: JobStatus;        // QUEUED | PROCESSING | EDITING | COMPLETED | FAILED
  createdAt: number;        // Unix timestamp
  updatedAt: number;
  fileSize: number;
  fileType: string;
  provider?: string;        // gemini | seedream | stub (if processing started)

  // Only present if status = COMPLETED
  result?: {
    analysisResult?: AnalysisResult;
    editResult?: EditResult;
    downloadUrl?: string;   // Presigned GET URL (expires in 1 hour)
  };

  // Only present if status = FAILED
  error?: {
    code: string;
    message: string;
  };
}
```

**Example:**

```bash
curl -X GET https://api-staging.photoeditor.com/v1/jobs/01HF9GXXX... \
  -H "X-Correlation-Id: req-def456"
```

**Response:**

```json
{
  "jobId": "01HF9GXXX...",
  "userId": "user-12345",
  "status": "COMPLETED",
  "createdAt": 1696512645000,
  "updatedAt": 1696512650000,
  "fileSize": 2048576,
  "fileType": "image/jpeg",
  "provider": "gemini",
  "result": {
    "analysisResult": {
      "labels": [
        { "name": "Cat", "confidence": 0.95 },
        { "name": "Pet", "confidence": 0.89 }
      ],
      "description": "A fluffy orange cat sitting on a windowsill"
    },
    "editResult": {
      "s3Key": "final/user-12345/01HF9GXXX.../result.jpg",
      "width": 1920,
      "height": 1080,
      "format": "jpeg",
      "size": 1536000
    },
    "downloadUrl": "https://photoeditor-prod-final.s3.amazonaws.com/..."
  }
}
```

**Errors:**

- `404 JOB_NOT_FOUND`: Job ID does not exist
- `500 INTERNAL_ERROR`: DynamoDB failure

---

### GET /v1/jobs/{jobId}/download

Get presigned download URL for processed result.

**Path Parameters:**
- `jobId` (required): Job identifier

**Response (200):**

```typescript
interface DownloadResponse {
  downloadUrl: string;      // S3 presigned GET URL
  expiresAt: number;        // Unix timestamp (1 hour from now)
  fileSize: number;         // Bytes
  fileType: string;         // MIME type
}
```

**Example:**

```bash
curl -X GET https://api-staging.photoeditor.com/v1/jobs/01HF9GXXX.../download \
  -H "X-Correlation-Id: req-ghi789"
```

**Response:**

```json
{
  "downloadUrl": "https://photoeditor-staging-final.s3.amazonaws.com/...",
  "expiresAt": 1696516245000,
  "fileSize": 1536000,
  "fileType": "image/jpeg"
}
```

**Errors:**

- `404 JOB_NOT_FOUND`: Job ID does not exist
- `409 JOB_NOT_COMPLETED`: Job status is not COMPLETED
- `500 INTERNAL_ERROR`: S3 failure

---

## Common Headers

### Request Headers

- `Content-Type: application/json` (required for POST/PUT)
- `X-Correlation-Id: <uuid>` (optional, recommended for tracing)
- `traceparent: <W3C format>` (optional, for distributed tracing)

### Response Headers

- `Content-Type: application/json`
- `X-Correlation-Id: <uuid>` (echoed from request or generated)
- `X-Trace-Id: <xray-trace-id>` (X-Ray trace ID for debugging)

## Rate Limiting

Per STANDARDS.md line 134:

- **Account-level:** 10,000 req/sec burst, sustained 10,000 req/sec
- **Per-route limits:**
  - `/v1/upload/presign`: 1,000 req/sec
  - `/v1/jobs/{id}`: 500 req/sec
  - `/v1/jobs/{id}/download`: 100 req/sec

**Rate Limit Headers (when throttled):**

```
HTTP/1.1 429 Too Many Requests
Retry-After: 10
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1696516260
```

## Versioning Strategy

Per STANDARDS.md line 87-88:

- **Current:** v1 (all endpoint paths are prefixed with `/v1/`)
- **Breaking changes:** New `/v2` prefix introduced
- **Support:** N-1 versions supported for 6 months
- **Deprecation:** Sunset date in `Sunset` HTTP header, 6-month notice

**Example future breaking change:**

```
POST /v{next}/jobs/presign
```

**Deprecation header (v1):**

```
Sunset: <SUNSET_HTTP_DATE>
Deprecation: true
Link: </v{next}/jobs/presign>; rel="alternate"
```

## Pagination

For future list endpoints (e.g., GET /jobs):

```typescript
interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    nextToken?: string;   // Opaque continuation token
    limit: number;        // Items per page (default: 20, max: 100)
  };
}
```

**Example:**

```bash
curl "https://api-staging.photoeditor.com/jobs?userId=user-12345&limit=20&nextToken=abc123"
```

## Contract Validation

Per ADR-0003 and STANDARDS.md line 40:

### Backend Validation (Zod)

```typescript
import { presignRequestSchema } from '@photoeditor/contracts';

export class PresignController {
  async presign(@Body() body: unknown) {
    const validated = presignRequestSchema.parse(body); // Throws on invalid
    // Process validated request...
  }
}
```

### Mobile Validation (Zod)

```typescript
import { jobStatusResponseSchema } from '@photoeditor/contracts';

const response = await fetch(`${API_URL}/v1/jobs/${jobId}`);
const data = await response.json();
const validated = jobStatusResponseSchema.parse(data); // Throws on invalid
```

### CI Contract Compatibility Tests

Per STANDARDS.md line 101, `contracts:check` runs in CI:

```typescript
// Test old client vs new server
test('v1 client can call v1 server', async () => {
  const oldRequest = { userId: 'user-1', fileSize: 1024, fileType: 'image/jpeg' };
  const response = await newServer.presign(oldRequest);
  expect(oldRequestSchema.safeParse(response.body)).toEqual({ success: true });
});

// Test new client vs old server (graceful degradation)
test('v2 client handles v1 server response', async () => {
  const newRequest = { userId: 'user-1', fileSize: 1024, fileType: 'image/jpeg', metadata: { foo: 'bar' } };
  const response = await oldServer.presign(newRequest);
  expect(newResponseSchema.safeParse(response.body)).toEqual({ success: true });
});
```

## OpenAPI Specification

Full OpenAPI 3.1 spec available at:
- **Staging:** `https://api-staging.photoeditor.com/openapi.json`
- **Production:** `https://api.photoeditor.com/openapi.json`

**Example Snippet:**

```yaml
openapi: 3.1.0
info:
  title: PhotoEditor API
  version: 1.0.0
paths:
  /v1/upload/presign:
    post:
      summary: Create job and get upload URL
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/PresignRequest'
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PresignResponse'
```

## Related Documents

- [Architecture Overview](../architecture/README.md)
- [Data Model](../data-model/jobs-table.md)
- ADR-0003 (Contract-First API)
- ADR-0005 (npm Workspaces Contract Drift Prevention)
- STANDARDS.md (lines 40, 87-88, 132-136, 145-146)
- docs/rubric.md (line 240: API contract docs requirement)
- docs/evidence/contract-compatibility-matrix.md
