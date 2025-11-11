# Implementation Reviewer Summary: TASK-0911C

## Task Overview
**Task ID:** TASK-0911C
**Title:** Configure expo-background-task for upload pipeline
**Status:** BLOCKED
**Reviewer:** implementation-reviewer agent
**Review Date:** 2025-11-11

## Implementation Status

**BLOCKED** - Fundamental API mismatch discovered that cannot be resolved without architectural changes.

## Blocker Summary

**Root Cause:** expo-background-task v1.0.8 does not support passing dynamic task data per execution.

The task requires "immediate dispatch after photo capture" with per-photo upload parameters (imageUri, fileName, mimeType, correlationId). However, the expo-background-task API only supports:

1. `TaskManager.defineTask(taskName, taskExecutor)` - Define task once globally
2. `BackgroundTask.registerTaskAsync(taskName, { minimumInterval })` - Register periodic execution (minimum 15 minutes on iOS, system-controlled on Android)
3. No mechanism to pass dynamic data per task execution

The `registerTaskAsync` API accepts only `BackgroundTaskOptions` with `minimumInterval` field. There is no way to pass custom data payload for immediate per-photo dispatch.

## Work Completed During Review

### 1. API Integration Fixed (Partial)
- ✓ Installed expo-task-manager dependency
- ✓ Changed `BackgroundTask.defineTask` → `TaskManager.defineTask`
- ✓ Changed `BackgroundTask.scheduleTaskAsync` → `BackgroundTask.registerTaskAsync`
- ✓ Changed `BackgroundTask.unregisterAllTasksAsync` → `BackgroundTask.unregisterTaskAsync(taskName)`
- ✓ Updated task executor signature to match `TaskManager.TaskManagerTaskBody<T>`
- ✓ Fixed return type to `BackgroundTask.BackgroundTaskResult` enum
- ✓ Fixed unused `attemptNumber` parameter (prefixed with underscore)
- ✓ Fixed `exactOptionalPropertyTypes` error in maxRetriesError construction

### 2. Standards Corrections Applied
- ✓ `standards/typescript.md#unused-variables-parameters`: Prefixed unused parameter with underscore
- ✓ `standards/typescript.md#immutability--readonly`: Used conditional spread for optional `cause` field
- ✓ Lint passes (0 errors, 2 pre-existing warnings unrelated to task)
- ✗ Typecheck blocked by test file errors (tests need rewrite for new API structure)

### 3. Blocker Documentation
Added comprehensive inline documentation in `scheduleUploadTask` explaining:
- API limitation (no dynamic data support)
- Architectural options to resolve
- Recommendation for Standards CR to change approach

## Standards Alignment Assessment

### Achieved
- **standards/typescript.md#analyzability:** Typed errors with correlation IDs, structured logging
- **standards/typescript.md#immutability--readonly:** Readonly interfaces, conditional spreads
- **standards/frontend-tier.md#services--integration-layer:** Ports & Adapters pattern maintained
- **standards/typescript.md#unused-variables-parameters:** Underscore prefix applied

### Blocked
- **Task acceptance criteria:** "Immediate dispatch with exponential backoff retry implemented" cannot be satisfied with expo-background-task v1.0.8 API
- **Task scope:** "Integrate with existing upload services" cannot be completed without dynamic data passing mechanism
- **Test coverage:** Test suite needs complete rewrite to match TaskManager API structure (body.data wrapping)

## Architectural Resolution Options

Per inline documentation in `backgroundTasks.ts`:

1. **AsyncStorage/SQLite queue + periodic polling** (Recommended)
   - Store upload jobs in local queue (AsyncStorage or SQLite)
   - Background task polls queue every 15 minutes (iOS minimum)
   - Process pending uploads with exponential backoff per item
   - Pros: Works within expo-background-task constraints
   - Cons: Not "immediate" dispatch (15min minimum interval)

2. **Switch to expo-notifications + fetch API**
   - Use expo-notifications background fetch capability
   - Allows custom data per notification
   - Pros: True immediate dispatch
   - Cons: Requires different API, notification permissions

3. **Use react-native-background-task or custom native module**
   - Bypass Expo managed workflow
   - Direct WorkManager/BGTaskScheduler integration
   - Pros: Full control, immediate dispatch
   - Cons: Ejects from Expo managed workflow

4. **Defer immediate dispatch requirement**
   - Change clarifications to accept batch periodic uploads
   - 15-minute polling window acceptable
   - Pros: Simplest path forward
   - Cons: Changes user experience expectations

## Recommendation

**BLOCK** task pending Standards CR to select architectural approach.

### Immediate Actions Required

1. **Create Standards CR task** (area: docs, blocked_by: TASK-0911C)
   - Title: "Standards CR: Select upload background execution architecture"
   - Document tradeoffs of 4 options above
   - Decide: AsyncStorage queue vs. API change vs. workflow change
   - Update `standards/frontend-tier.md#services--integration-layer` with chosen pattern
   - Cite this blocker summary as evidence

2. **Update TASK-0911C clarifications**
   - If queue approach selected: Change "immediate dispatch" → "background queue with 15min polling"
   - If expo-notifications selected: Add expo-notifications dependency, update scope
   - If deferring: Update acceptance criteria to reflect batch uploads

3. **Rewrite test suite** (after architecture decision)
   - Wrap all inputs in `{ data: {...}, error: null, executionInfo: {...} }` structure
   - Test queue persistence if queue approach selected
   - Update mocks to match chosen API surface

## Diff Safety Audit

Per `docs/agents/diff-safety-checklist.md`:

- ✗ **Lint passing:** 0 errors, but typecheck blocked
- ✗ **Test suite:** Requires rewrite for new API
- ✓ **No @ts-ignore or eslint-disable introduced**
- ✓ **No skipped tests**
- ✓ **Standards citations correct**
- **Blocker documented inline with architectural options**

## Files Modified

### Code Changes
- `/home/jeffreymoya/dev/photoeditor/mobile/package.json` - Added expo-task-manager dependency
- `/home/jeffreymoya/dev/photoeditor/mobile/src/features/upload/backgroundTasks.ts` - API corrections + blocker documentation
- `/home/jeffreymoya/dev/photoeditor/mobile/src/features/upload/__tests__/backgroundTasks.test.ts` - Partial API corrections (incomplete)

### No Changes to
- `/home/jeffreymoya/dev/photoeditor/mobile/app.json` - Configuration already correct
- `/home/jeffreymoya/dev/photoeditor/mobile/app/_layout.tsx` - Registration already correct
- `/home/jeffreymoya/dev/photoeditor/mobile/src/screens/CameraScreen.tsx` - Integration stub already correct

## Lint/Typecheck Results

### Lint: PASS
```
photoeditor-mobile:lint:fix: ✖ 2 problems (0 errors, 2 warnings)
```
Pre-existing warnings unrelated to TASK-0911C:
- JobDetailScreen-router.test.tsx:4 (import/no-named-as-default)
- JobsIndexScreen-router.test.tsx:3 (import/no-named-as-default)

### Typecheck: FAIL
```
src/features/upload/__tests__/backgroundTasks.test.ts(111,11-111,24): error TS2322
src/features/upload/backgroundTasks.ts(364,9-370,4): error TS2375 (FIXED)
```
Test file errors due to incomplete API structure wrapping. Resolved in main file via conditional spread for optional `cause` field.

## Standards Citations

Implementation reviewed against:
- `standards/frontend-tier.md#services--integration-layer` - Ports & Adapters pattern
- `standards/typescript.md#analyzability` - Typed errors, correlation IDs
- `standards/typescript.md#immutability--readonly` - Readonly interfaces, conditional spreads
- `standards/typescript.md#unused-variables-parameters` - Underscore prefix for intentional non-use
- `standards/testing-standards.md#coverage-expectations` - Test suite requires rewrite

## Decision

**Status:** BLOCKED
**Reason:** expo-background-task v1.0.8 API does not support dynamic task data per execution. Immediate per-photo upload dispatch cannot be implemented without architectural changes.

**Next Step:** Create Standards CR task to select architecture (queue vs. API change vs. workflow change) and update task clarifications accordingly.

---

**Reviewer:** implementation-reviewer agent
**Timestamp:** 2025-11-11
**Schema Version:** 1.1
**Evidence:** This summary + inline blocker documentation in backgroundTasks.ts
