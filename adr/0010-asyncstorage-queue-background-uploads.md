# ADR 0010: AsyncStorage Queue for Background Upload Pipeline

- Status: Accepted
- Date: 2025-11-10

## Context

TASK-0911C aimed to migrate the upload pipeline from the current polling/push model to expo-background-task (WorkManager on Android, BGTaskScheduler on iOS) with "immediate dispatch after photo capture" using exponential backoff retry. During implementation, a fundamental API limitation was discovered: **expo-background-task v1.0.8 does not support passing dynamic task data per execution**.

The expo-background-task API registers tasks with static configuration only. There is no mechanism to pass execution-specific data (imageUri, fileName, correlationId, etc.) when scheduling a task. This conflicts with the requirement for immediate dispatch where each photo capture should trigger an independent upload operation with per-photo parameters.

Four architectural options emerged:

1. **AsyncStorage Queue (15min polling)**: Store upload tasks in AsyncStorage queue. expo-background-task polls queue every 15min and processes pending uploads.
2. **expo-notifications workaround**: Use silent notifications to pass upload data via notification payload, triggering background task.
3. **Custom Native Module**: Build custom native module with direct WorkManager/BGTaskScheduler access for full control.
4. **Defer Immediate Dispatch**: Abandon expo-background-task and revert to existing polling model.

Industry research (2025-11-10) confirmed that AsyncStorage queue is the established pattern for this scenario, with official Expo guidance stating: "If you want BackgroundFetch to work based on a particular piece of user-defined data, you would want to store that data in a global location (e.g., in AsyncStorage), and then have a single background task registered that reads the data from that global location" (Expo Forums).

Platform API constraints are universal: Android WorkManager minimum interval is 15 minutes, iOS BGTaskScheduler has similar system-controlled scheduling, and both platforms limit background task execution to ~30 seconds.

This ADR documents the decision to adopt the AsyncStorage queue pattern for background uploads, aligning with industry standards and project maintainability requirements.

## Decision

Adopt **AsyncStorage queue with 15-minute background polling** for the upload pipeline, replacing the original "immediate dispatch" requirement with "foreground immediate dispatch + background polling."

**Key Principles**:

1. **Industry Standard Pattern**: AsyncStorage queue is the production-proven approach for dynamic background tasks in React Native/Expo, evidenced by libraries like `react-native-queue-asyncstorage` and official Expo guidance.

2. **Platform API Alignment**: 15-minute polling interval aligns with Android WorkManager and iOS BGTaskScheduler constraints (minimum 15min interval, ~30sec execution limit).

3. **Expo Managed Workflow**: Stays within Expo's managed workflow without custom native modules, reducing maintenance burden for solo maintainer.

4. **Foreground Optimization**: Immediate dispatch in foreground for responsive UX, background polling handles app backgrounded/killed scenarios.

5. **Standards Compliance**: Follows `standards/frontend-tier.md` service integration patterns, `standards/typescript.md` error handling (neverthrow Result), and `standards/testing-standards.md` coverage thresholds.

**Implementation Pattern**:

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

// Write to queue (foreground, immediate)
await AsyncStorage.setItem(
  `upload-queue:${taskId}`,
  JSON.stringify(uploadTask)
);

// Background task polls queue (every 15min)
TaskManager.defineTask('upload-processor', async () => {
  const tasks = await loadUploadQueue();
  for (const task of tasks) {
    const result = await processUpload(task);
    if (result.isOk()) {
      await removeFromQueue(task.id);
    } else {
      await retryWithBackoff(task);
    }
  }
  return BackgroundFetch.BackgroundFetchResult.NewData;
});
```

**Acceptance Criteria Revision**:

- **Original**: "Immediate dispatch with exponential backoff retry"
- **Updated**: "Foreground immediate dispatch + 15min background polling with exponential backoff retry"

**Components**:

1. **Queue Module**: AsyncStorage-backed queue for storing upload tasks (write, read, remove operations)
2. **Foreground Dispatcher**: Writes to queue immediately after photo capture (non-blocking UX)
3. **Background Processor**: expo-background-task polls queue every 15min, processes pending uploads
4. **Retry Strategy**: Exponential backoff (1s, 2s, 4s, 8s, max 60s) per upload attempt, max retries limit
5. **Test Suite**: Mock AsyncStorage, verify queue operations, test retry logic, meet coverage thresholds (≥70% lines, ≥60% branches)

## Consequences

**Positive**:
- Aligns with industry-standard pattern for React Native/Expo background uploads (AsyncStorage queue + periodic polling)
- Works within platform API constraints (15min minimum interval on both Android WorkManager and iOS BGTaskScheduler)
- Maintains Expo managed workflow, avoiding custom native module maintenance burden
- Testable with standard mocking patterns (AsyncStorage, expo-task-manager)
- Foreground immediate dispatch provides responsive UX for active users
- Exponential backoff retry improves reliability for transient network failures
- Low complexity, well-understood pattern reduces solo maintainer cognitive load

**Negative**:
- Background uploads delayed by up to 15 minutes when app is backgrounded/killed (platform constraint, not implementation choice)
- Not true "immediate dispatch" for background scenarios, requires acceptance criteria update
- AsyncStorage I/O overhead for queue operations (mitigated by batch processing in background task)
- Queue persistence requires manual cleanup of completed/expired tasks to avoid unbounded growth

**Neutral**:
- 15-minute polling interval is standard for background tasks across both platforms, not a deviation from ecosystem norms
- Queue pattern adds implementation complexity vs. hypothetical immediate dispatch, but complexity is unavoidable given API limitations
- Exponential backoff max 60s matches original TASK-0911C clarifications, no change to retry strategy

## Alternatives Considered

### 1. expo-notifications Workaround
- **Pros**: Can pass dynamic data via notification payload, triggers background task on demand
- **Cons**: Hacky abuse of notification API, requires notification permissions, unreliable (OS may throttle silent notifications), not mentioned in industry best practices
- **Rejected**: Fragile workaround, fails standards/frontend-tier.md principle of "reliable, testable patterns"

### 2. Custom Native Module
- **Pros**: Full control over WorkManager/BGTaskScheduler, supports dynamic data, no API limitations
- **Cons**: High maintenance burden (Java/Swift codebases), defeats Expo managed workflow purpose, violates solo maintainer simplicity requirement
- **Rejected**: Maintenance overhead unacceptable per `standards/global.md` maintainability constraints

### 3. Defer Immediate Dispatch (Revert to Polling)
- **Pros**: Simplest option, no new dependencies, current polling model works
- **Cons**: Abandons TASK-0911 goal of background upload reliability improvements, no benefit from expo-background-task migration
- **Rejected**: Fails to deliver value of background task adoption, contradicts TASK-0911C objectives

### 4. Immediate Dispatch Without Queue (Original Approach)
- **Pros**: Matches original TASK-0911C acceptance criteria
- **Cons**: Technically impossible with expo-background-task v1.0.8 API (no dynamic data passing), blocked implementation-reviewer
- **Rejected**: API limitation makes this unimplementable without custom native code

## Industry Standards Research

**Date**: 2025-11-10
**Sources**: Expo forums, Stack Overflow, production libraries, platform documentation

**Key Findings**:

1. **Official Expo Guidance** (Expo Forums):
   > "If you want BackgroundFetch to work based on a particular piece of user-defined data, you would want to store that data in a global location (e.g., in AsyncStorage), and then have a single background task registered that reads the data from that global location"

2. **Production Libraries**: `react-native-queue-asyncstorage` and forks used in production for React Native job queues with AsyncStorage persistence

3. **Platform Constraints**:
   - Android WorkManager: Minimum interval 15 minutes
   - iOS BGTaskScheduler: System-controlled scheduling, ~15min typical interval
   - Both platforms: ~30 second execution limit per background task

4. **Upload Queue Pattern**: Store tasks in AsyncStorage with metadata (URI, fileName, correlationId), periodic processor polls queue and executes uploads during 30-second execution window

5. **Modern API**: expo-background-task replaces deprecated expo-background-fetch in Expo SDK 53+

**Conclusion**: AsyncStorage queue with 15min polling is the industry-standard pattern for this exact scenario, validated by official Expo guidance, production libraries, and platform API constraints.

## Compliance References

This ADR satisfies the following standards requirements:

- `standards/frontend-tier.md#services--integration-layer`: Ports & Adapters pattern for service integration, queue as adapter to background task API
- `standards/typescript.md#analyzability`: Typed errors with correlation IDs, neverthrow Result pattern for error handling
- `standards/typescript.md#immutability--readonly`: Readonly fields in queue task structure
- `standards/testing-standards.md`: Coverage thresholds (≥70% lines, ≥60% branches), mockable AsyncStorage for tests
- `standards/global.md`: ADR governance, solo maintainer maintainability constraints

## Related Work

- Implementation Task: `tasks/mobile/TASK-0911C-expo-background-task-upload.task.yaml` (updated with AsyncStorage queue approach)
- Implementation Summary: `.agent-outputs/TASK-0911C-implementation-summary.md` (blocked with original immediate dispatch approach)
- Review Summary: `.agent-outputs/implementation-reviewer-summary-TASK-0911C.md` (identified API blocker, proposed 4 options)
- Changelog: `changelog/2025-11-10-asyncstorage-queue-decision.md` (architecture decision rationale)
- Parent ADR: ADR 0009 Mobile Stack Modernization (TASK-0911 Phase 4: Camera & Background Jobs)
- Industry Research: Web searches conducted 2025-11-10 (Expo forums, Stack Overflow, production libraries, platform docs)
