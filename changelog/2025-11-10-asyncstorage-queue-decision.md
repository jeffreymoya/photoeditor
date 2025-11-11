# TASK-0911C: AsyncStorage Queue Architecture Decision - UNBLOCKED

**Date:** 2025-11-10
**Task ID:** TASK-0911C
**Status:** TODO (unblocked)
**Priority:** P2
**Area:** mobile

## Summary

TASK-0911C **unblocked** with architectural decision to adopt **AsyncStorage queue pattern with 15-minute background polling** for upload pipeline. Decision documented in ADR-0010, aligns with industry standards and platform constraints. Task acceptance criteria updated from "immediate dispatch" to "foreground immediate dispatch + 15min background polling."

## Background: API Limitation Discovery

Initial implementation attempt blocked due to fundamental API limitation: **expo-background-task v1.0.8 does not support passing dynamic task data per execution**. Cannot implement "immediate dispatch after photo capture" with per-photo parameters (imageUri, fileName, correlationId) using the original approach.

### Root Cause
The expo-background-task API registers tasks with static configuration only. There is no mechanism to pass execution-specific data (e.g., which photo to upload) when scheduling a task. This conflicts with the original requirement for "immediate dispatch with exponential backoff retry" where each photo capture should trigger an independent upload operation.

### API Limitations Identified
1. `BackgroundTask.registerTaskAsync()` - No data parameter for dynamic per-execution data
2. `TaskManager.defineTask()` - Task body receives no execution-specific context
3. Task execution is periodic/system-triggered, not event-driven

## Architectural Decision

**Selected: AsyncStorage Queue (15min polling)** per ADR-0010

### Decision Rationale

1. **Industry Standard Pattern**: AsyncStorage queue is the production-proven approach for dynamic background tasks in React Native/Expo, validated by:
   - Official Expo guidance: "store that data in a global location (e.g., in AsyncStorage), and then have a single background task registered that reads the data from that global location" (Expo Forums)
   - Production libraries: `react-native-queue-asyncstorage` and forks used in production
   - Industry best practices research (2025-11-10)

2. **Platform API Alignment**: 15-minute polling interval aligns with platform constraints:
   - Android WorkManager: Minimum interval 15 minutes
   - iOS BGTaskScheduler: System-controlled scheduling, ~15min typical interval
   - Both platforms: ~30 second execution limit per background task

3. **Project Standards Compliance**:
   - Expo managed workflow (no custom native modules) - reduces maintenance burden for solo maintainer
   - Testable with standard mocking patterns (AsyncStorage, expo-task-manager)
   - Follows `standards/frontend-tier.md` service integration patterns
   - Meets `standards/typescript.md` error handling requirements (Result pattern, correlation IDs)
   - Achieves `standards/testing-standards.md` coverage thresholds (≥70% lines, ≥60% branches)

4. **Foreground Optimization**: Immediate dispatch in foreground for responsive UX, background polling handles app backgrounded/killed scenarios

### Implementation Pattern

```typescript
// Queue Structure
interface UploadTask {
  id: string;
  imageUri: string;
  fileName: string;
  correlationId: string;
  timestamp: number;
  retryCount: number;
  lastError?: string;
}

// Foreground: Write to queue immediately after capture
await uploadQueue.write(uploadTask);
await attemptImmediateUpload(uploadTask); // Non-blocking, responsive UX

// Background: expo-background-task polls queue every 15min
TaskManager.defineTask('upload-processor', async () => {
  const tasks = await uploadQueue.readAll();
  for (const task of tasks) {
    const result = await processUploadWithRetry(task);
    if (result.isOk()) {
      await uploadQueue.remove(task.id);
    } else {
      await uploadQueue.updateRetryCount(task.id);
    }
  }
  return BackgroundFetch.BackgroundFetchResult.NewData;
});
```

### Alternatives Considered and Rejected

1. **expo-notifications workaround**: Hacky abuse of notification API, unreliable, not mentioned in industry best practices
2. **Custom Native Module**: High maintenance burden, defeats Expo managed workflow purpose, violates solo maintainer simplicity requirement
3. **Defer Immediate Dispatch**: Abandons TASK-0911 goal of background upload reliability improvements

## Task Updates

### Acceptance Criteria Revised
- **Original**: "Immediate dispatch with exponential backoff retry"
- **Updated**: "Foreground immediate dispatch + 15min background polling with exponential backoff retry"

### Plan Updates (7 steps)
1. Create AsyncStorage upload queue module (write, read, remove operations)
2. Create background task module for uploads
3. Implement upload background task worker (polls queue, processes uploads)
4. Implement exponential backoff retry strategy (1s, 2s, 4s, 8s, max 60s)
5. Configure background task scheduling in app.json (15min minimum interval)
6. Integrate upload queue with foreground photo capture (CameraScreen)
7. Add tests for upload queue and background task workers

### New Deliverables
- `mobile/src/features/upload/uploadQueue.ts` - AsyncStorage-backed queue module
- `mobile/src/features/upload/backgroundTasks.ts` - Background task workers (15min polling)
- `mobile/src/features/upload/__tests__/uploadQueue.test.ts` - Queue operation tests
- `mobile/src/features/upload/__tests__/backgroundTasks.test.ts` - Worker tests
- `adr/0010-asyncstorage-queue-background-uploads.md` - Architecture decision record

## Impact: UNBLOCKED

- **TASK-0911C**: Status changed from `blocked` → `todo`, ready for implementation
- **TASK-0911**: Remains blocked by other subtasks (TASK-0911B, TASK-0911D, TASK-0911E, TASK-0911F)
- **TASK-0911D, TASK-0911E**: Still blocked by TASK-0911B (VisionCamera Skia frame processors)
- **TASK-0911F**: Now only blocked by TASK-0911C (after architecture decision, can proceed once TASK-0911C completes)

## Industry Research Summary

**Date**: 2025-11-10
**Sources**: Expo forums, Stack Overflow, production libraries, platform documentation

**Key Findings**:
1. Official Expo guidance confirms AsyncStorage queue pattern for dynamic background tasks
2. Android WorkManager minimum interval: 15 minutes (platform constraint, not implementation choice)
3. iOS BGTaskScheduler: System-controlled scheduling, ~15min typical interval
4. Both platforms: ~30 second execution limit per background task
5. Production libraries exist (`react-native-queue-asyncstorage`) validating this pattern

## Next Steps

1. ✅ **ADR Created**: `adr/0010-asyncstorage-queue-background-uploads.md`
2. ✅ **Task Updated**: `tasks/mobile/TASK-0911C-expo-background-task-upload.task.yaml` (status: todo, plan revised, acceptance criteria updated)
3. ✅ **Changelog Updated**: This file (renamed from blocked to decision)
4. ⏭️ **Standards Update**: Add AsyncStorage queue pattern to `standards/frontend-tier.md`
5. ⏭️ **Implementation**: Re-execute TASK-0911C with AsyncStorage queue approach (deferred per user request)

## Files Modified

- `tasks/mobile/TASK-0911C-expo-background-task-upload.task.yaml` - Status: blocked → todo, plan revised, acceptance criteria updated, agent_completion_state cleared
- `adr/0010-asyncstorage-queue-background-uploads.md` - Created (architecture decision)
- `changelog/2025-11-10-asyncstorage-queue-decision.md` - This file (renamed from blocked)

## Previous Agent Outputs (Reference)

- **Implementation Summary (blocked):** `.agent-outputs/TASK-0911C-implementation-summary.md`
- **Reviewer Summary (blocker identified):** `.agent-outputs/implementation-reviewer-summary-TASK-0911C.md`

These outputs documented the API limitation discovery and proposed 4 architectural options. Architecture decision made based on industry research and project standards alignment.

---

**References:**
- ADR: `adr/0010-asyncstorage-queue-background-uploads.md`
- Task file: `tasks/mobile/TASK-0911C-expo-background-task-upload.task.yaml`
- Industry research: Web searches conducted 2025-11-10 (Expo forums, Stack Overflow, production libraries)
- Platform docs: Android WorkManager, iOS BGTaskScheduler
- expo-background-task docs: https://docs.expo.dev/versions/latest/sdk/background-task/
