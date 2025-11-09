# Tests: Split Core-Flow, Worker-Flow, Schema-Diff Scripts

**Date/Time**: 2025-10-03 UTC
**Agent**: task-picker (TASK-0009)
**Branch**: main
**Task**: TASK-0009-tests-split-core-worker-schema.task.yaml

## Summary

Added three specialized npm test scripts to improve test organization, analysability, and feedback loops for the backend test suite. The new scripts filter tests into logical categories: core API contracts, worker processing flow, and schema/build validation.

**Key Achievement**: Developers can now run focused test suites based on their work context, reducing test execution time and improving feedback speed. The scripts use Jest's `--testPathPattern` to filter tests without requiring code changes to test files.

## Context

The backend test suite contained tests for multiple concerns (API handlers, worker services, reliability, build validation) all run together via a single `npm test` command. This made it difficult to:
- Run only tests relevant to specific work (e.g., API changes vs worker changes)
- Get fast feedback during development
- Analyze test failures in CI by functional area
- Understand test coverage by system component

This task implements three focused test scripts that align with the system's architecture and common development workflows.

## Changes Made

### 1. Added Test Filtering Scripts

**File Modified**: `backend/package.json`

**Changes**:
```json
{
  "scripts": {
    "test:core-flow": "jest --testPathPattern='tests/unit/lambdas/(presign|status)\\.test'",
    "test:worker-flow": "jest --testPathPattern='tests/unit/(services|logger)|tests/reliability'",
    "test:schema-diff": "jest --testPathPattern='tests/build|tests/unit/lambdas/import-validation'"
  }
}
```

**Script Breakdown**:

1. **`test:core-flow`** (12 tests, ~3s)
   - Tests presign and status Lambda handlers
   - Validates core API contracts (request/response shapes)
   - Covers single and batch upload flows
   - Tests error handling for API endpoints

2. **`test:worker-flow`** (70 tests, ~5s)
   - Tests worker services (JobService, NotificationService, S3Service)
   - Validates structured logging (AppLogger)
   - Tests reliability features (DLQ redrive, idempotency)
   - Covers batch job operations and status tracking

3. **`test:schema-diff`** (19 tests, ~3s)
   - Tests build validation (dependencies, bundles, ZIPs)
   - Validates lambda import smoke tests
   - Checks esbuild configuration consistency
   - Verifies external dependency configuration

**Rationale**: Using regex patterns with `--testPathPattern` allows flexible, maintainable test filtering without adding test tags or modifying test files. The patterns map to the directory structure which reflects architectural boundaries.

### 2. Fixed Jest Configuration to Include Build Tests

**File Modified**: `backend/jest.config.js`

**Change**:
```javascript
// Before:
testPathIgnorePatterns: [
  '/node_modules/',
  '/dist/',
  '/build/',  // This was blocking tests/build/
  '/tmp/'
],

// After:
testPathIgnorePatterns: [
  '/node_modules/',
  '/dist/',
  '<rootDir>/build/',  // Now only ignores root-level build/ directory
  '/tmp/'
],
```

**Issue Resolved**: The original `/build/` pattern was too broad and blocked `tests/build/` from running. The new pattern `<rootDir>/build/` specifically ignores only the root-level build output directory while allowing `tests/build/` test files to execute.

## Validation

### Test Execution Results

All three scripts were validated to run successfully:

1. **test:core-flow**:
   ```
   Test Suites: 2 passed, 2 total
   Tests:       12 passed, 12 total
   Time:        3.09s
   ```
   - Runs: `tests/unit/lambdas/presign.test.ts`, `tests/unit/lambdas/status.test.ts`

2. **test:worker-flow**:
   ```
   Test Suites: 5 passed, 5 total
   Tests:       70 passed, 70 total
   Time:        5.017s
   ```
   - Runs: all service tests, logger tests, reliability tests

3. **test:schema-diff**:
   ```
   Test Suites: 3 passed, 3 total
   Tests:       19 passed, 19 total
   Time:        2.666s
   ```
   - Runs: build validation tests, import smoke tests

### Commands Run

```bash
# Validation commands from task specification
cd backend && npm run test:core-flow --silent
cd backend && npm run test:worker-flow --silent
cd backend && npm run test:schema-diff --silent

# Additional validation
cd backend && npm run test:build --silent  # Now works correctly
```

### Test Selection Verification

Manual verification confirmed appropriate test selection:
- **Core flow**: Only API handler tests (presign, status)
- **Worker flow**: Service layer, logging, and reliability tests
- **Schema diff**: Build validation and import smoke tests

## Impact

### Positive Impacts

1. **Faster Feedback Loops**: Developers can run only relevant tests for their changes
   - API changes: run `test:core-flow` (~3s instead of ~11s)
   - Service changes: run `test:worker-flow` (~5s)
   - Build changes: run `test:schema-diff` (~3s)

2. **Improved Analysability**: Test failures can be quickly categorized by architectural layer

3. **Better CI Integration**: Future CI pipelines can run these scripts in parallel or conditionally based on changed files

4. **Maintained Compatibility**: Existing `npm test` still runs all tests; these scripts are additive

### No Breaking Changes

- All existing test scripts (`test`, `test:unit`, `test:build`, etc.) continue to work
- No test files were modified
- No test behavior was changed

## Deliverables

- **backend/package.json**: Added three new test scripts
- **backend/jest.config.js**: Fixed testPathIgnorePatterns to allow tests/build/

## Next Steps

These test scripts satisfy acceptance criteria and unblock TASK-0012 (Makefile stage1-verify aggregator) which depends on having focused test categories.

Potential future enhancements (not in scope for this task):
- Add integration test splits if integration tests are added
- Consider using Jest projects for more complex test configurations
- Add test:watch variants for each category
- Document these scripts in CONTRIBUTING.md

## Files Changed

- `/home/jeffreymoya/dev/photoeditor/backend/package.json` - Added 3 test scripts
- `/home/jeffreymoya/dev/photoeditor/backend/jest.config.js` - Fixed build directory ignore pattern

## Task Status

**Status**: Completed
**Validation**: All acceptance criteria met
- ✓ Three scripts exist and execute matching subsets without erroring
- ✓ Test selection is appropriate for each category
- ✓ Scripts run successfully and report passing tests
