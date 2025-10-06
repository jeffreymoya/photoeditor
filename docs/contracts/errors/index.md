# Error Contract Reference

## Overview

This document defines the canonical error schema for the Photo Editor API. All errors returned by backend services, Lambda handlers, and exposed through API endpoints must conform to this contract to ensure consistent client-side error handling.

**Source of Truth:** `shared/types/error.types.ts`

**Related Standards:**
- `standards/shared-contracts-tier.md` (line 11): Error contracts unified with shared markdown reference
- `standards/global.md` (line 28): Typed errors & Results everywhere using neverthrow
- `docs/compatibility/versioning.md`: API versioning and deprecation policy

## Error Types

All errors in the Photo Editor system are classified into one of the following types:

### ErrorType Enum

```typescript
export enum ErrorType {
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT = 'RATE_LIMIT',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}
```

## Base Error Schema

All error types extend the `BaseError` interface, which provides the minimum required fields:

```typescript
interface BaseError {
  type: ErrorType;           // Classification of the error
  code: string;              // Machine-readable error code (e.g., "INVALID_FILE_TYPE")
  message: string;           // Human-readable error message
  details?: Record<string, unknown>;  // Optional additional context
  timestamp: string;         // ISO 8601 timestamp when error occurred
  requestId?: string;        // Correlation ID for tracing
  userId?: string;           // User ID if authenticated
  jobId?: string;           // Job ID if error is job-related
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `ErrorType` | Yes | Classification from the ErrorType enum |
| `code` | `string` | Yes | Specific error code (e.g., `FILE_TOO_LARGE`, `INVALID_TOKEN`) |
| `message` | `string` | Yes | Human-readable description suitable for logging or developer debugging |
| `details` | `Record<string, unknown>` | No | Additional context specific to the error type |
| `timestamp` | `string` | Yes | ISO 8601 format (e.g., `2025-10-06T13:45:30.123Z`) |
| `requestId` | `string` | No | Correlation ID for distributed tracing (should be propagated from incoming requests) |
| `userId` | `string` | No | Authenticated user identifier if the request was authenticated |
| `jobId` | `string` | No | Job identifier if the error occurred during job processing |

## Specialized Error Types

### ValidationError

Used for request validation failures, including schema validation, file format validation, and business rule violations.

```typescript
interface ValidationError extends BaseError {
  type: ErrorType.VALIDATION;
  fieldErrors?: Record<string, string[]>;  // Map of field names to error messages
}
```

**Example:**

```json
{
  "type": "VALIDATION",
  "code": "INVALID_REQUEST",
  "message": "Request validation failed",
  "timestamp": "2025-10-06T13:45:30.123Z",
  "requestId": "req-abc123",
  "fieldErrors": {
    "fileSize": ["File size exceeds maximum allowed (50MB)"],
    "fileType": ["File type must be JPEG, PNG, or WEBP"]
  }
}
```

### ProviderError

Used when external AI/ML provider services fail or return errors.

```typescript
interface ProviderError extends BaseError {
  type: ErrorType.PROVIDER_ERROR;
  provider: string;         // Name of the provider (e.g., "openai", "replicate")
  providerCode?: string;    // Error code from the provider
  retryable: boolean;       // Whether the client should retry
}
```

**Example:**

```json
{
  "type": "PROVIDER_ERROR",
  "code": "PROVIDER_RATE_LIMIT",
  "message": "AI provider rate limit exceeded",
  "timestamp": "2025-10-06T13:45:30.123Z",
  "requestId": "req-abc123",
  "jobId": "job-xyz789",
  "provider": "openai",
  "providerCode": "rate_limit_exceeded",
  "retryable": true,
  "details": {
    "retryAfter": 60
  }
}
```

### InternalError

Used for unexpected errors, exceptions, and system failures that are not user-facing.

```typescript
interface InternalError extends BaseError {
  type: ErrorType.INTERNAL_ERROR;
  stack?: string;                      // Stack trace (only in non-production)
  context?: Record<string, unknown>;   // Additional debug context
}
```

**Example:**

```json
{
  "type": "INTERNAL_ERROR",
  "code": "UNEXPECTED_ERROR",
  "message": "An unexpected error occurred during job processing",
  "timestamp": "2025-10-06T13:45:30.123Z",
  "requestId": "req-abc123",
  "jobId": "job-xyz789",
  "context": {
    "step": "image_processing",
    "retryCount": 2
  }
}
```

**Note:** The `stack` field should NEVER be included in production responses. It is only for development/staging environments.

## HTTP Status Code Mappings

Each `ErrorType` maps to a specific HTTP status code:

```typescript
const ERROR_HTTP_STATUS: Record<ErrorType, number> = {
  VALIDATION: 400,              // Bad Request
  AUTHENTICATION: 401,          // Unauthorized
  AUTHORIZATION: 403,           // Forbidden
  NOT_FOUND: 404,              // Not Found
  CONFLICT: 409,               // Conflict
  RATE_LIMIT: 429,             // Too Many Requests
  PROVIDER_ERROR: 502,         // Bad Gateway
  SERVICE_UNAVAILABLE: 503,    // Service Unavailable
  INTERNAL_ERROR: 500          // Internal Server Error
}
```

## Job Status Error Mappings

When errors occur during job processing, they affect the job status:

```typescript
const ERROR_JOB_STATUS = {
  VALIDATION: 'FAILED',
  PROVIDER_ERROR: 'FAILED',
  INTERNAL_ERROR: 'FAILED',
  SERVICE_UNAVAILABLE: 'FAILED'
}
```

## Error Response Format

All API endpoints return errors in the following JSON format:

```json
{
  "error": {
    "type": "ERROR_TYPE",
    "code": "SPECIFIC_ERROR_CODE",
    "message": "Human-readable error message",
    "timestamp": "2025-10-06T13:45:30.123Z",
    "requestId": "req-abc123",
    "details": {}
  }
}
```

The error object conforms to one of the error interfaces (`BaseError`, `ValidationError`, `ProviderError`, or `InternalError`).

## Client Error Handling Guidelines

### TypeScript/JavaScript Clients

When using TypeScript or JavaScript clients, leverage the error type discrimination:

```typescript
import { AppError, ErrorType } from '@photoeditor/shared';

async function handleApiError(error: AppError) {
  switch (error.type) {
    case ErrorType.VALIDATION:
      // Show field-specific errors to user
      if ('fieldErrors' in error && error.fieldErrors) {
        displayFieldErrors(error.fieldErrors);
      }
      break;

    case ErrorType.AUTHENTICATION:
      // Redirect to login
      redirectToLogin();
      break;

    case ErrorType.AUTHORIZATION:
      // Show permission denied message
      showPermissionDenied();
      break;

    case ErrorType.NOT_FOUND:
      // Show 404 page
      show404();
      break;

    case ErrorType.RATE_LIMIT:
      // Show rate limit message with retry guidance
      const retryAfter = error.details?.retryAfter || 60;
      showRateLimitError(retryAfter);
      break;

    case ErrorType.PROVIDER_ERROR:
      if ('retryable' in error && error.retryable) {
        // Retry the request
        await retryRequest();
      } else {
        // Show provider error message
        showProviderError(error.provider);
      }
      break;

    case ErrorType.INTERNAL_ERROR:
    case ErrorType.SERVICE_UNAVAILABLE:
      // Show generic error message and log for debugging
      console.error('System error:', error);
      showGenericError();
      break;
  }
}
```

### Non-TypeScript Clients

For clients not using TypeScript (Swift, Kotlin, Python, etc.):

1. **Parse the error response** into a structured object
2. **Check the `type` field** to determine error classification
3. **Use the `code` field** for specific error handling logic
4. **Display the `message` field** to developers (not end users)
5. **Check `retryable` field** on provider errors before retrying
6. **Use `requestId`** for support tickets and debugging

**Example (pseudo-code):**

```
if error.type == "VALIDATION":
    if error.fieldErrors:
        show_field_errors(error.fieldErrors)
    else:
        show_validation_error(error.message)

elif error.type == "PROVIDER_ERROR":
    if error.retryable:
        schedule_retry()
    else:
        show_provider_error(error.provider, error.message)

elif error.type == "RATE_LIMIT":
    retry_after = error.details.get("retryAfter", 60)
    show_rate_limit_message(retry_after)

else:
    log_error(error.requestId, error.type, error.code)
    show_generic_error()
```

## Error Code Conventions

Error codes follow a hierarchical naming convention:

- **Format:** `<CATEGORY>_<SPECIFIC_REASON>`
- **Style:** SCREAMING_SNAKE_CASE
- **Examples:**
  - `FILE_TOO_LARGE`
  - `INVALID_FILE_TYPE`
  - `INVALID_TOKEN`
  - `MISSING_REQUIRED_FIELD`
  - `JOB_NOT_FOUND`
  - `PROVIDER_RATE_LIMIT`
  - `INSUFFICIENT_CREDITS`

### Common Error Codes by Type

#### VALIDATION Errors
- `INVALID_REQUEST` - General validation failure
- `MISSING_REQUIRED_FIELD` - Required field not provided
- `INVALID_FILE_TYPE` - Unsupported file format
- `FILE_TOO_LARGE` - File size exceeds limit
- `INVALID_IMAGE_DIMENSIONS` - Image dimensions outside acceptable range

#### AUTHENTICATION Errors
- `INVALID_TOKEN` - JWT or API token is invalid
- `EXPIRED_TOKEN` - Token has expired
- `MISSING_TOKEN` - No authentication token provided

#### AUTHORIZATION Errors
- `INSUFFICIENT_PERMISSIONS` - User lacks required permissions
- `INSUFFICIENT_CREDITS` - User account has insufficient credits
- `SUBSCRIPTION_REQUIRED` - Feature requires active subscription

#### NOT_FOUND Errors
- `JOB_NOT_FOUND` - Job ID does not exist
- `RESOURCE_NOT_FOUND` - Generic resource not found

#### RATE_LIMIT Errors
- `RATE_LIMIT_EXCEEDED` - Too many requests in time window

#### PROVIDER_ERROR Errors
- `PROVIDER_UNAVAILABLE` - External provider is down
- `PROVIDER_RATE_LIMIT` - Provider rate limit exceeded
- `PROVIDER_TIMEOUT` - Provider request timed out
- `PROVIDER_INVALID_RESPONSE` - Provider returned invalid data

#### INTERNAL_ERROR Errors
- `UNEXPECTED_ERROR` - Unhandled exception
- `DATABASE_ERROR` - Database operation failed
- `CONFIGURATION_ERROR` - System misconfiguration

#### SERVICE_UNAVAILABLE Errors
- `SERVICE_MAINTENANCE` - Planned maintenance
- `SERVICE_OVERLOADED` - System under heavy load

## Error Evolution and Deprecation

Error contracts follow the same versioning policy as API endpoints (see `docs/compatibility/versioning.md`).

### Adding New Error Types (Non-Breaking)

1. Add new `ErrorType` enum value
2. Update `ERROR_HTTP_STATUS` mapping
3. Update `ERROR_JOB_STATUS` mapping if applicable
4. Document the new error type in this reference
5. Add contract tests for the new error type

**No version bump required** as long as clients have proper fallback handling for unknown error types.

### Adding New Error Codes (Non-Breaking)

1. Add new error code to the relevant section above
2. Document usage examples
3. Add contract tests

**No version bump required** as long as the error type remains the same.

### Changing Error Schemas (Breaking)

The following changes are considered **breaking** and require a new API version:

1. Removing fields from `BaseError` or specialized error interfaces
2. Renaming fields
3. Changing field types
4. Making optional fields required
5. Removing error types from the `ErrorType` enum
6. Changing HTTP status code mappings

Follow the deprecation playbook in `docs/compatibility/versioning.md` for breaking changes.

## Testing Requirements

All error scenarios must be covered by contract tests:

1. **Unit tests** for error construction and serialization
2. **Contract tests** for API error responses
3. **Integration tests** for error propagation through the system
4. **Client tests** for error handling logic

See `docs/testing-standards.md` for detailed requirements.

## References

- **Schema Definition:** `shared/types/error.types.ts`
- **Versioning Policy:** `docs/compatibility/versioning.md`
- **Shared Contracts Tier:** `standards/shared-contracts-tier.md`
- **Global Standards:** `standards/global.md`
- **Testing Standards:** `docs/testing-standards.md`

## Change History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-06 | Initial error contract reference created |
