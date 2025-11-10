# TASK-0913 Clarifications

**Task:** Restore imageProcessing.service coverage gates
**Status:** Resolved
**Date:** 2025-11-10

## Outstanding Questions & Resolutions

### Q1: Coverage Thresholds

**Question:** Should this task use baseline thresholds (70% lines, 60% branches) or higher thresholds (80%/70%/75%) mentioned in the task description?

**Decision:** Use baseline thresholds from `standards/testing-standards.md`:
- Lines: e70%
- Branches: e60%
- Functions: No specific threshold enforced (coverage naturally improves with line/branch coverage)

**Rationale:** The testing standards explicitly state that the baseline applies unless tier-specific overrides are documented. No override exists in `standards/backend-tier.md` for services.

**Reference:** `standards/testing-standards.md#coverage-expectations`

---

### Q2: Provider Success vs. Fallback Coverage Depth

**Question:** Should tests exercise both the provider success path and fallback path in `editAndFinalizeImage()`?

**Decision:** Cover both paths with equal rigor:
- **Success path** (lines 181-191): Provider returns edited image URL � fetch � upload to S3
- **Fallback path** (lines 192-200): Provider fails or returns no URL � copy optimized image to final location

**Rationale:** Both paths represent critical business flows. The fallback ensures graceful degradation when the editing provider fails, which is a core resilience requirement.

**Implementation approach:**
- Mock `editingProvider.editImage()` to return success/failure results
- Mock global fetch (or inject HTTP client - see Q3) for success path
- Assert correct S3 operations in each branch

**Reference:** `standards/backend-tier.md#domain-service-layer` (orchestration methods must handle I/O failures)

---

### Q3: Global Fetch Mocking Strategy

**Question:** Should tests stub global `fetch()` or introduce an injectable HTTP seam?

**Decision:** Introduce an injectable HTTP client/adapter

**Rationale:**
- Aligns with `standards/typescript.md#3-analyzability` (testable dependencies via DI)
- Follows existing pattern where services receive dependencies via constructor
- Improves testability without global mocking, making tests more deterministic

**Implementation approach:**
- Create a simple `HttpClient` interface with `fetch()` method
- Inject via constructor: `constructor(..., private readonly httpClient: HttpClient)`
- Production code uses injected client; tests provide mock implementation
- Keep refactoring minimal (single interface + constructor param)

**Reference:** `standards/backend-tier.md#patterns` (inject all I/O dependencies via constructor)

---

### Q4: Batch Job Progress Testing Scope

**Question:** Should tests cover batch job notification paths and error scenarios?

**Decision:** Cover critical paths for now (success/completion notification), defer error edge cases

**Scope for this task:**
-  Happy path: batch job progress increments and triggers completion notification when done
-  Non-batch jobs: verify no batch logic executes when `job.batchJobId` is null/undefined
-  Batch error scenarios: defer to future task if coverage gaps remain

**Rationale:** The method's error handling currently throws (line 220), contradicting the "non-critical" comment. Focus on proven paths first; address error handling inconsistency in a follow-up if needed.

**Reference:** `standards/testing-standards.md#coverage-expectations` (exercise happy paths and failure paths that impact contracts)

---

## Coverage Branches Identified

Based on service analysis, tests must cover these branches:

### `processUploadedImage()` (main orchestration)
1. Batch job path (`job.batchJobId` exists)
2. Non-batch job path (`job.batchJobId` is null/undefined)

### `analyzeImage()` (private)
- Single path (no conditional branches, pure orchestration)

### `editAndFinalizeImage()` (private)
1. **Success branch:** `analysisResult.success === true` � extract analysis data
2. **Fallback branch:** `analysisResult.success === false` � use default prompt
3. **Edited image success:** `editedImageResult.success === true && editedImageData?.editedImageUrl` � fetch and upload
4. **Edited image fallback:** `editedImageResult.success === false` OR no URL � copy optimized to final

### `handleBatchJobProgress()` (private)
1. Batch job completes � send completion notification
2. Batch job still in progress � no notification

## Test Seams Required

1. **JobService:** Mock all methods (`markJobProcessing`, `markJobEditing`, `markJobCompleted`, `incrementBatchJobProgress`)
2. **S3Service:** Mock all methods (optimize, presigned URLs, upload, copy, delete)
3. **NotificationService:** Mock notification methods
4. **ProviderFactory:** Mock to return mock analysis/editing providers
5. **Analysis Provider:** Mock `analyzeImage()` to return success/failure
6. **Editing Provider:** Mock `editImage()` to return success/failure with/without URL
7. **HttpClient (new):** Injectable interface to mock `fetch()` for edited image retrieval

## Standards Compliance

-  Coverage thresholds: `standards/testing-standards.md#coverage-expectations`
-  Service testability: `standards/backend-tier.md#domain-service-layer`
-  Injectable dependencies: `standards/typescript.md#3-analyzability`
-  Validation commands: `standards/qa-commands-ssot.md#package-scoped-preferred-for-agents-and-focused-work`

## Promotion Readiness

All outstanding questions resolved. Task is ready for promotion to `todo` status.

---

## Implementation Summary (2025-11-10)

**Status:** COMPLETED

### Final Coverage Results
- **Lines:** 100% (45/45) - Exceeds 70% baseline ✓
- **Branches:** 93.33% (14/15) - Exceeds 60% baseline ✓
- **Statements:** 97.82% (45/46) ✓
- **Functions:** 83.33% (5/6) ✓

### Implementation Decisions Applied
1. ✓ Used baseline thresholds (70% lines, 60% branches) per Q1 resolution
2. ✓ Covered both provider success and fallback paths per Q2 resolution
3. ✓ Introduced injectable HttpClient interface per Q3 resolution
4. ✓ Covered critical batch job paths (success/completion) per Q4 resolution

### Files Modified
- `backend/src/services/imageProcessing.service.ts` - Added HttpClient interface and injection
- `backend/tests/unit/services/imageProcessing.service.test.ts` - Created with 9 comprehensive tests

### Evidence
- Coverage report: `docs/evidence/coverage-reports/TASK-0913-image-processing-service.md`
- QA logs: `.agent-output/TASK-0913-*.log`

All acceptance criteria met. Standards compliance verified.
