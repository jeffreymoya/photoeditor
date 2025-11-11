/**
 * Background task workers for upload pipeline with AsyncStorage queue pattern
 * Per ADR-0010: AsyncStorage queue + 15min background polling for dynamic task data
 * Per standards/frontend-tier.md#background-task-queue-pattern: AsyncStorage queue pattern
 * Per standards/frontend-tier.md#services--integration-layer: Ports & Adapters pattern
 * Per standards/typescript.md#analyzability: Typed errors with code, category, cause
 *
 * Implements expo-background-task workers with 15min polling interval, exponential
 * backoff retry strategy, and AsyncStorage queue integration for reliable upload
 * execution on WorkManager (Android) and BGTaskScheduler (iOS).
 */

import * as BackgroundTask from 'expo-background-task';
import Constants from 'expo-constants';
import * as TaskManager from 'expo-task-manager';

import { preprocessImage } from '@/lib/upload/preprocessing';

import {
  readAllFromQueue,
  removeFromQueue,
  updateTaskRetry,
  cleanupExpiredTasks,
  type UploadTask,
} from './uploadQueue';

/**
 * Background task identifiers
 * Per ADR-0010: Single background task polls queue every 15min
 * Per expo-background-task API: unique task names for WorkManager/BGTaskScheduler
 */
export const BACKGROUND_TASK_NAMES = {
  UPLOAD_PROCESSOR: 'photoeditor.upload.processor',
} as const;

/**
 * Upload task result
 * Per ADR-0010: Result of successful upload execution
 */
export interface UploadTaskResult {
  readonly jobId: string;
  readonly key: string;
  readonly uploadedAt: string;
}

/**
 * Re-export UploadTask from uploadQueue for test convenience
 */
export type { UploadTask } from './uploadQueue';

/**
 * Typed error codes for upload failures
 * Per standards/typescript.md#analyzability: Typed errors with code, category, cause
 */
export enum UploadErrorCode {
  PREPROCESSING_FAILED = 'PREPROCESSING_FAILED',
  PRESIGN_REQUEST_FAILED = 'PRESIGN_REQUEST_FAILED',
  S3_UPLOAD_FAILED = 'S3_UPLOAD_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MAX_RETRIES_EXCEEDED = 'MAX_RETRIES_EXCEEDED',
}

/**
 * Upload error with typed code and category
 */
export interface UploadError {
  readonly code: UploadErrorCode;
  readonly category: 'client' | 'server' | 'network';
  readonly message: string;
  readonly cause?: Error;
  readonly retryable: boolean;
}

/**
 * Result type for operations that can fail
 */
export type Result<T, E> = { success: true; value: T } | { success: false; error: E };

/**
 * Retry configuration
 * Per ADR-0010: exponential backoff 1s, 2s, 4s, 8s, max 60s
 */
export interface RetryConfig {
  readonly maxRetries: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

/**
 * Default retry configuration: exponential backoff with cap
 * Per ADR-0010: max retries limit to prevent unbounded queue growth
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 4, // 0 initial + 4 retries = 5 total attempts
  baseDelayMs: 1000, // 1s base
  maxDelayMs: 60000, // 60s max per ADR-0010
} as const;

/**
 * Calculate exponential backoff delay with cap
 * Per ADR-0010: 1s, 2s, 4s, 8s, max 60s exponential backoff
 *
 * @param attempt - Current retry attempt (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  return Math.min(exponentialDelay, config.maxDelayMs);
}

/**
 * Check if task should be retried based on backoff delay
 * Per ADR-0010: Apply exponential backoff before retrying failed uploads
 *
 * @param task - Upload task from queue
 * @param config - Retry configuration
 * @returns True if enough time has passed since last attempt
 */
export function shouldRetryTask(
  task: UploadTask,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): boolean {
  // First attempt always runs
  if (task.retryCount === 0) {
    return true;
  }

  // Max retries exceeded
  if (task.retryCount > config.maxRetries) {
    return false;
  }

  // Calculate required backoff delay for this retry count
  const requiredDelay = calculateBackoffDelay(task.retryCount - 1, config);
  const timeSinceLastAttempt = Date.now() - task.timestamp;

  return timeSinceLastAttempt >= requiredDelay;
}

/**
 * Request presigned upload URL from backend
 * Per standards/typescript.md#analyzability: Pure port interface, impure adapter
 */
async function requestPresignUrl(
  apiEndpoint: string,
  fileName: string,
  mimeType: string,
  size: number,
  correlationId: string
): Promise<Result<{ uploadUrl: string; jobId: string; key: string }, UploadError>> {
  try {
    const response = await fetch(`${apiEndpoint}/v1/upload/presign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
      },
      body: JSON.stringify({
        fileName,
        mimeType,
        size,
      }),
    });

    if (!response.ok) {
      const isServerError = response.status >= 500;
      const isClientError = response.status >= 400 && response.status < 500;

      return {
        success: false,
        error: {
          code: UploadErrorCode.PRESIGN_REQUEST_FAILED,
          category: isServerError ? 'server' : isClientError ? 'client' : 'network',
          message: `Presign request failed: ${response.status} ${response.statusText}`,
          retryable: isServerError || response.status === 429,
        },
      };
    }

    const data = await response.json();
    return { success: true, value: data };
  } catch (error) {
    return {
      success: false,
      error: {
        code: UploadErrorCode.NETWORK_ERROR,
        category: 'network',
        message: 'Network error during presign request',
        cause: error instanceof Error ? error : new Error(String(error)),
        retryable: true,
      },
    };
  }
}

/**
 * Upload file to S3 using presigned URL
 */
async function uploadToS3(
  presignedUrl: string,
  fileUri: string,
  mimeType: string,
  correlationId: string
): Promise<Result<void, UploadError>> {
  try {
    const fileBlob = await fetch(fileUri).then(r => r.blob());

    const response = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType,
        'X-Correlation-Id': correlationId,
      },
      body: fileBlob,
    });

    if (!response.ok) {
      const isServerError = response.status >= 500;

      return {
        success: false,
        error: {
          code: UploadErrorCode.S3_UPLOAD_FAILED,
          category: isServerError ? 'server' : 'client',
          message: `S3 upload failed: ${response.status} ${response.statusText}`,
          retryable: isServerError || response.status === 429 || response.status === 408,
        },
      };
    }

    return { success: true, value: undefined };
  } catch (error) {
    return {
      success: false,
      error: {
        code: UploadErrorCode.NETWORK_ERROR,
        category: 'network',
        message: 'Network error during S3 upload',
        cause: error instanceof Error ? error : new Error(String(error)),
        retryable: true,
      },
    };
  }
}

/**
 * Preprocess image and handle errors
 */
async function preprocessImageSafe(
  imageUri: string,
  correlationId: string
): Promise<
  Result<{ uri: string; mimeType: string; size: number }, UploadError>
> {
  try {
    const preprocessed = await preprocessImage(imageUri);
    return { success: true, value: preprocessed };
  } catch (error) {
    console.error('[BackgroundTask] Preprocessing failed (non-retryable)', {
      correlationId,
      error,
    });

    return {
      success: false,
      error: {
        code: UploadErrorCode.PREPROCESSING_FAILED,
        category: 'client',
        message: 'Image preprocessing failed',
        cause: error instanceof Error ? error : new Error(String(error)),
        retryable: false,
      },
    };
  }
}

/**
 * Execute single upload attempt for queued task
 * Per ADR-0010: Process upload task from AsyncStorage queue
 *
 * @param task - Upload task from queue
 * @returns Result with upload result or error
 */
async function attemptUpload(
  task: UploadTask
): Promise<Result<UploadTaskResult, UploadError>> {
  const apiEndpoint = Constants.expoConfig?.extra?.apiBaseUrl || 'http://localhost:3000';

  // Step 1: Preprocess image
  const preprocessResult = await preprocessImageSafe(task.imageUri, task.correlationId);
  if (!preprocessResult.success) {
    return preprocessResult;
  }

  const preprocessed = preprocessResult.value;

  // Step 2: Request presigned URL
  const presignResult = await requestPresignUrl(
    apiEndpoint,
    task.fileName,
    preprocessed.mimeType,
    preprocessed.size,
    task.correlationId
  );

  if (!presignResult.success) {
    if (!presignResult.error.retryable) {
      console.error('[BackgroundTask] Presign request failed (non-retryable)', {
        correlationId: task.correlationId,
        error: presignResult.error,
      });
    }
    return presignResult;
  }

  const { uploadUrl, jobId, key } = presignResult.value;

  // Step 3: Upload to S3
  const uploadResult = await uploadToS3(
    uploadUrl,
    preprocessed.uri,
    preprocessed.mimeType,
    task.correlationId
  );

  if (!uploadResult.success) {
    if (!uploadResult.error.retryable) {
      console.error('[BackgroundTask] S3 upload failed (non-retryable)', {
        correlationId: task.correlationId,
        jobId,
        error: uploadResult.error,
      });
    }
    return uploadResult;
  }

  // Success!
  return {
    success: true,
    value: {
      jobId,
      key,
      uploadedAt: new Date().toISOString(),
    },
  };
}

/**
 * Process single task from queue with retry logic
 * Per ADR-0010: Retry with exponential backoff, update queue retry count
 * Per standards/typescript.md#analyzability: Log retry attempts with correlation IDs
 *
 * @param task - Upload task from queue
 * @param config - Retry configuration
 * @returns Result with upload result or error
 */
async function processQueueTask(
  task: UploadTask,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<Result<UploadTaskResult, UploadError>> {
  // Check if task should be retried based on backoff delay
  if (!shouldRetryTask(task, config)) {
    console.warn('[BackgroundTask] Task not ready for retry yet', {
      taskId: task.id,
      correlationId: task.correlationId,
      retryCount: task.retryCount,
      timeSinceLastAttempt: Date.now() - task.timestamp,
    });
    // Return "success" to skip this task for now (will be retried next poll)
    return {
      success: false,
      error: {
        code: UploadErrorCode.MAX_RETRIES_EXCEEDED,
        category: 'client',
        message: 'Backoff delay not elapsed',
        retryable: true,
      },
    };
  }

  // Log attempt with correlation ID
  if (task.retryCount > 0) {
    console.warn('[BackgroundTask] Retry attempt from queue', {
      taskId: task.id,
      retryCount: task.retryCount,
      maxRetries: config.maxRetries,
      correlationId: task.correlationId,
      fileName: task.fileName,
      lastError: task.lastError,
    });
  }

  const result = await attemptUpload(task);

  if (result.success) {
    console.warn('[BackgroundTask] Upload succeeded', {
      taskId: task.id,
      correlationId: task.correlationId,
      jobId: result.value.jobId,
      retryCount: task.retryCount,
    });
    return result;
  }

  const error = result.error;

  // Don't retry non-retryable errors
  if (!error.retryable) {
    console.error('[BackgroundTask] Upload failed (non-retryable)', {
      taskId: task.id,
      correlationId: task.correlationId,
      error,
    });
    return result;
  }

  // Update retry count in queue for next attempt
  const newRetryCount = task.retryCount + 1;
  const updateResult = await updateTaskRetry(task.id, newRetryCount, error.message);

  if (!updateResult.success) {
    console.warn('[BackgroundTask] Failed to update task retry count', {
      taskId: task.id,
      error: updateResult.error,
    });
  }

  // Check if max retries exceeded
  if (newRetryCount > config.maxRetries) {
    console.error('[BackgroundTask] Max retries exceeded', {
      taskId: task.id,
      correlationId: task.correlationId,
      retryCount: newRetryCount,
      maxRetries: config.maxRetries,
    });

    return {
      success: false,
      error: {
        code: UploadErrorCode.MAX_RETRIES_EXCEEDED,
        category: 'client',
        message: `Upload failed after ${config.maxRetries} retry attempts`,
        ...(error.cause ? { cause: error.cause } : {}),
        retryable: false,
      },
    };
  }

  console.warn('[BackgroundTask] Upload attempt failed (retryable)', {
    taskId: task.id,
    correlationId: task.correlationId,
    error,
    retryCount: newRetryCount,
  });

  // Return error but keep task in queue for next poll
  return result;
}

/**
 * Handle task result and update queue accordingly
 * Extracted to reduce complexity of uploadProcessorTask
 *
 * @param task - Upload task that was processed
 * @param result - Result of upload attempt
 * @returns Tuple of [successCount, errorCount] increments
 */
async function handleTaskResult(
  task: UploadTask,
  result: Result<UploadTaskResult, UploadError>
): Promise<[number, number]> {
  if (result.success) {
    // Upload succeeded - remove from queue
    const removeResult = await removeFromQueue(task.id);
    if (!removeResult.success) {
      console.warn('[BackgroundTask] Failed to remove completed task from queue', {
        taskId: task.id,
        error: removeResult.error,
      });
    }
    return [1, 0]; // successCount++
  }

  if (!result.error.retryable) {
    // Non-retryable error - remove from queue
    const removeResult = await removeFromQueue(task.id);
    if (removeResult.success) {
      console.warn('[BackgroundTask] Removed non-retryable task from queue', {
        taskId: task.id,
        error: result.error,
      });
    }
    return [0, 1]; // errorCount++
  }

  // Retryable error - keep in queue for next poll
  console.warn('[BackgroundTask] Task will be retried next poll', {
    taskId: task.id,
    retryCount: task.retryCount,
  });
  return [0, 0];
}

/**
 * Background task worker for upload queue processor
 * Per ADR-0010: Polls AsyncStorage queue every 15min and processes pending uploads
 * Per expo-task-manager API: Task executor receives body (no dynamic data needed)
 * Per standards/frontend-tier.md#services--integration-layer: Isolated adapter implementation
 *
 * Platform constraints per ADR-0010:
 * - Minimum 15min polling interval (WorkManager/BGTaskScheduler)
 * - Maximum 30sec execution window
 * - Must return Success to reschedule, Failed/NoData to cancel
 */
export async function uploadProcessorTask(): Promise<BackgroundTask.BackgroundTaskResult> {
  try {
    console.warn('[BackgroundTask] Upload processor started');
    const startTime = Date.now();

    // Step 1: Clean up expired tasks (>24h old)
    const cleanupResult = await cleanupExpiredTasks();
    if (cleanupResult.success && cleanupResult.value > 0) {
      console.warn('[BackgroundTask] Cleaned up expired tasks', {
        count: cleanupResult.value,
      });
    }

    // Step 2: Read all pending tasks from queue
    const queueResult = await readAllFromQueue();
    if (!queueResult.success) {
      console.error('[BackgroundTask] Failed to read queue', {
        error: queueResult.error,
      });
      return BackgroundTask.BackgroundTaskResult.Failed;
    }

    const tasks = queueResult.value;
    console.warn('[BackgroundTask] Processing queue', { taskCount: tasks.length });

    if (tasks.length === 0) {
      console.warn('[BackgroundTask] No tasks in queue');
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    const EXECUTION_TIME_LIMIT_MS = 25000; // 25s to stay under 30s platform limit

    // Step 3: Process tasks sequentially within time limit
    for (const task of tasks) {
      // Check if we're approaching execution time limit
      const elapsed = Date.now() - startTime;
      if (elapsed > EXECUTION_TIME_LIMIT_MS) {
        console.warn('[BackgroundTask] Approaching execution time limit, stopping', {
          processedCount,
          remainingCount: tasks.length - processedCount,
          elapsed,
        });
        break;
      }

      processedCount++;
      const result = await processQueueTask(task);
      const [successInc, errorInc] = await handleTaskResult(task, result);
      successCount += successInc;
      errorCount += errorInc;
    }

    const elapsed = Date.now() - startTime;
    console.warn('[BackgroundTask] Upload processor completed', {
      processedCount,
      successCount,
      errorCount,
      elapsed,
    });

    // Return Success to ensure task reschedules for next poll
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.error('[BackgroundTask] Unexpected error in upload processor', { error });
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
}

/**
 * Register background tasks
 * Per ADR-0010: Define upload processor task with TaskManager
 * Per expo-task-manager API: Called in app initialization (_layout.tsx)
 */
export function registerBackgroundTasks(): void {
  TaskManager.defineTask(BACKGROUND_TASK_NAMES.UPLOAD_PROCESSOR, uploadProcessorTask);
  console.warn('[BackgroundTask] Registered upload processor task');
}

/**
 * Start background upload processor with 15min polling
 * Per ADR-0010: Register periodic background task (15min minimum interval)
 * Per expo-background-task API: Register task with WorkManager/BGTaskScheduler
 *
 * Platform constraints:
 * - Android WorkManager: 15min minimum interval
 * - iOS BGTaskScheduler: System-controlled, typically ~15min
 * - Both: 30sec execution limit
 *
 * Call this once at app startup to enable background upload processing.
 */
export async function startUploadProcessor(): Promise<Result<void, Error>> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_TASK_NAMES.UPLOAD_PROCESSOR
    );

    if (isRegistered) {
      console.warn('[BackgroundTask] Upload processor already registered');
      return { success: true, value: undefined };
    }

    await BackgroundTask.registerTaskAsync(BACKGROUND_TASK_NAMES.UPLOAD_PROCESSOR, {
      minimumInterval: 15 * 60, // 15 minutes in seconds
    });

    console.warn('[BackgroundTask] Upload processor registered with 15min interval');
    return { success: true, value: undefined };
  } catch (error) {
    console.error('[BackgroundTask] Failed to start upload processor', { error });
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Stop background upload processor
 * Per ADR-0010: Unregister periodic background task
 * Cleanup utility for testing or app teardown
 */
export async function stopUploadProcessor(): Promise<Result<void, Error>> {
  try {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK_NAMES.UPLOAD_PROCESSOR);
    console.warn('[BackgroundTask] Upload processor unregistered');
    return { success: true, value: undefined };
  } catch (error) {
    console.error('[BackgroundTask] Failed to stop upload processor', { error });
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
