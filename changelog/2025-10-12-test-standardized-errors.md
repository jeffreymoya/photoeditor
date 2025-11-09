# Changelog: Update Tests for Standardized Error Response Format

**Date:** 2025-10-12
**Time:** 07:20 UTC
**Agent:** Claude Code
**Branch:** main
**Task:** TASK-0604

## Context

Backend error responses were updated to use the RFC 7807 standardized error format (with `code`, `detail`, `title`, `type`, `instance`, `timestamp`) per enhanced error handling in `backend/src/utils/errors.ts:153`. However, unit and contract tests still expected the old format (`{error: "..."}`) causing test failures. This session updates all affected tests to validate against the new standardized error schema.

## Summary

Updated unit and contract tests for presign and status lambdas to validate RFC 7807 error response format instead of old format. Added required @backend/core mocks to properly initialize services during testing. All tests now pass and validate the complete standardized error structure.

## Changes

### Test Files Updated

#### `/backend/tests/unit/lambdas/presign.test.ts`
- **Lines 100-124:** Updated "should reject missing request body" test
  - Changed from expecting `{error: 'Request body required'}` to RFC 7807 format
  - Now validates: `code`, `title`, `detail`, `instance`, `type`, `timestamp`
  - Verifies headers: `Content-Type`, `x-request-id`
- **Lines 128-149:** Updated "should reject unsupported content type (image/gif)" test
  - Changed status code expectation from 500 to 400
  - Added RFC 7807 format validation
- **Lines 152-173:** Updated "should reject file size > 50MB" test
  - Changed status code expectation from 500 to 400
  - Added RFC 7807 format validation
- **Lines 265-286:** Updated "should reject batch with unsupported content type" test
  - Changed status code expectation from 500 to 400
  - Added RFC 7807 format validation
- **Lines 291-317:** Updated "should handle DynamoDB errors gracefully" test
  - Changed from expecting `{error: 'Internal server error'}` to full RFC 7807 structure
  - Validates error contains `unexpected error` in detail
- **Line 203:** Updated S3 key format regex from `temp/` to `uploads/` (reflects recent S3 structure change)
- **Lines 31-49, 54-69:** Added @backend/core mock for `createSSMClient`, `createDynamoDBClient`, `createS3Client`, `createSNSClient`, `ConfigService`, `BootstrapService`, `StandardProviderCreator`
  - Returns actual mocked AWS SDK client instances from aws-sdk-client-mock
  - Fixes initialization errors in lambda handler

#### `/backend/tests/unit/lambdas/status.test.ts`
- **Lines 54-75:** Updated "should return 400 when jobId is missing" test
  - Changed from expecting `{error: 'Job ID required'}` to RFC 7807 format
  - Now validates: `code: 'MISSING_JOB_ID'`, `title: 'Validation Error'`, `detail`, `instance`, `type`, `timestamp`
  - Verifies correlation headers
- **Lines 140-164:** Updated "should return 404 when job does not exist" test
  - Changed from expecting `{error: 'Job not found'}` to RFC 7807 format
  - Validates: `code: 'JOB_NOT_FOUND'`, `title: 'Resource Not Found'`, `detail` contains jobId
- **Lines 167-189:** Updated "should return 500 on DynamoDB errors" test
  - Changed from expecting `{error: 'Internal server error'}` to RFC 7807 format
  - Validates: `code: 'UNEXPECTED_ERROR'`, `title: 'Internal Server Error'`, `detail` contains `unexpected error`

#### `/backend/tests/contracts/presign.contract.test.ts`
- **Lines 52-69:** Added @backend/core mock (same as unit tests)
  - Fixes 500 errors in success case tests (lines 105-147)
  - Allows proper service initialization with mocked AWS clients
- **No changes needed to error validation tests** - already used RFC 7807 format

## Validation

### Test Execution Results
All 30 tests pass across 4 test files:

```bash
PASS tests/unit/lambdas/presign.test.ts (7 tests)
PASS tests/contracts/presign.contract.test.ts (8 tests)
PASS tests/unit/lambdas/status.test.ts (5 tests)
PASS tests/contracts/status.contract.test.ts (10 tests)
```

### Commands Run
```bash
# Unit tests
npm test --prefix backend -- presign.test.ts
npm test --prefix backend -- status.test.ts

# Contract tests
npm test --prefix backend -- presign.contract.test.ts
npm test --prefix backend -- status.contract.test.ts

# Coverage (subset)
npm test --prefix backend -- --testPathPattern="(presign|status)\.test\.ts" --coverage
```

### Coverage for Modified Tests
- `job.service.ts`: 44% lines, 28% branches (presign service tested)
- `presign.service.ts`: 100% lines, 100% branches
- `errors.ts`: 23% lines (error formatting logic)
- Overall: Subset coverage meets file-specific thresholds; full suite coverage validated separately

### Evidence Artifacts Generated
- `docs/evidence/contract-tests/presign.log` - Presign contract test execution log
- `docs/evidence/contract-tests/status.log` - Status contract test execution log
- `docs/evidence/coverage-reports/error-tests-coverage.txt` - Coverage report for modified tests

## Acceptance Criteria Met

✅ All presign lambda unit tests pass (backend/tests/unit/lambdas/presign.test.ts)
✅ All status lambda unit tests pass (backend/tests/unit/lambdas/status.test.ts)
✅ All presign contract tests pass (backend/tests/contracts/presign.contract.test.ts)
✅ Status contract tests continue to pass (already aligned)
✅ Error response assertions validate all standardized fields: code, title, detail, instance, type, timestamp
✅ Tests verify x-request-id header propagation for correlation
✅ No changes to lambda implementation code or error utilities
✅ Contract tests validate error responses for every error scenario

## Standards Alignment

- **backend-tier.md:108** - Tests validate error response structure
- **testing-standards.md:96-129** - Contract tests validate RFC 7807 format
- **global.md:39** - Correlation IDs propagate through headers (x-request-id verified in tests)
- **shared/types/error.types.ts:66-81** - ApiErrorResponse interface compliance verified

## Notes

- **No ADR needed** - Test-only changes to align with existing error handling implementation
- **S3 Key Format:** Tests updated to expect `uploads/` prefix instead of `temp/` (aligns with recent backend changes)
- **Mock Strategy:** Added @backend/core mock returning actual aws-sdk-client-mock instances to fix initialization issues in lambda handlers
- **Mutation Testing:** Deferred to full QA suite run (time-intensive, not blocking for test alignment)

## Next Steps

None - task complete. All tests validate RFC 7807 error format.
