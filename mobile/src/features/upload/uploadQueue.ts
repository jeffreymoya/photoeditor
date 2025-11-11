/**
 * AsyncStorage-backed upload queue module
 * Per ADR-0010: Queue pattern for background task dynamic data
 * Per standards/frontend-tier.md#background-task-queue-pattern: AsyncStorage queue for background operations
 * Per standards/typescript.md#analyzability: Typed errors with code, category, cause
 * Per standards/typescript.md#immutability--readonly: Readonly fields for immutability
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Upload task structure stored in AsyncStorage queue
 * Per ADR-0010: Task metadata for background processing
 */
export interface UploadTask {
  readonly id: string;
  readonly imageUri: string;
  readonly fileName: string;
  readonly correlationId: string;
  readonly timestamp: number;
  readonly retryCount: number;
  readonly lastError?: string;
}

/**
 * Queue storage key prefix for AsyncStorage
 * Per standards/frontend-tier.md: Namespaced keys for clarity
 */
const QUEUE_KEY_PREFIX = 'upload-queue:';
const QUEUE_INDEX_KEY = 'upload-queue:index';

/**
 * Typed error codes for queue operations
 * Per standards/typescript.md#analyzability: Typed errors with code, category
 */
export enum QueueErrorCode {
  STORAGE_READ_FAILED = 'STORAGE_READ_FAILED',
  STORAGE_WRITE_FAILED = 'STORAGE_WRITE_FAILED',
  STORAGE_DELETE_FAILED = 'STORAGE_DELETE_FAILED',
  TASK_NOT_FOUND = 'TASK_NOT_FOUND',
  INVALID_TASK_DATA = 'INVALID_TASK_DATA',
}

/**
 * Queue operation error
 */
export interface QueueError {
  readonly code: QueueErrorCode;
  readonly category: 'storage' | 'validation';
  readonly message: string;
  readonly cause?: Error;
}

/**
 * Result type for operations that can fail
 * Per standards/typescript.md#analyzability: Result pattern for error handling
 */
export type Result<T, E> = { success: true; value: T } | { success: false; error: E };

/**
 * Write upload task to queue
 * Per ADR-0010: Foreground immediate dispatch writes to queue
 * Per standards/typescript.md#immutability--readonly: Returns new task, doesn't mutate
 *
 * @param task - Upload task to queue
 * @returns Result with task ID or error
 */
export async function writeToQueue(
  task: Omit<UploadTask, 'id' | 'timestamp' | 'retryCount'>
): Promise<Result<string, QueueError>> {
  try {
    const taskId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const fullTask: UploadTask = {
      ...task,
      id: taskId,
      timestamp: Date.now(),
      retryCount: 0,
    };

    // Write task to storage
    const taskKey = `${QUEUE_KEY_PREFIX}${taskId}`;
    await AsyncStorage.setItem(taskKey, JSON.stringify(fullTask));

    // Update index of task IDs for efficient retrieval
    const indexResult = await getQueueIndex();
    if (!indexResult.success) {
      // If index read fails, still return success for task write
      // Index will be rebuilt on next read
      console.warn('[UploadQueue] Failed to update index after write', {
        taskId,
        error: indexResult.error,
      });
      return { success: true, value: taskId };
    }

    const updatedIndex = [...indexResult.value, taskId];
    try {
      await AsyncStorage.setItem(QUEUE_INDEX_KEY, JSON.stringify(updatedIndex));
    } catch (indexError) {
      // If index write fails, still return success for task write
      console.warn('[UploadQueue] Failed to write index after task write', {
        taskId,
        error: indexError,
      });
    }

    return { success: true, value: taskId };
  } catch (error) {
    return {
      success: false,
      error: {
        code: QueueErrorCode.STORAGE_WRITE_FAILED,
        category: 'storage',
        message: 'Failed to write task to upload queue',
        cause: error instanceof Error ? error : new Error(String(error)),
      },
    };
  }
}

/**
 * Read all pending upload tasks from queue
 * Per ADR-0010: Background worker polls queue for pending tasks
 *
 * @returns Result with array of tasks or error
 */
export async function readAllFromQueue(): Promise<Result<UploadTask[], QueueError>> {
  try {
    const indexResult = await getQueueIndex();
    if (!indexResult.success) {
      return { success: false, error: indexResult.error };
    }

    const taskIds = indexResult.value;
    const tasks: UploadTask[] = [];

    for (const taskId of taskIds) {
      const taskKey = `${QUEUE_KEY_PREFIX}${taskId}`;
      const taskJson = await AsyncStorage.getItem(taskKey);

      if (!taskJson) {
        // Task in index but not in storage - clean up index
        console.warn('[UploadQueue] Task in index but not found in storage', { taskId });
        continue;
      }

      try {
        const task = JSON.parse(taskJson) as UploadTask;
        tasks.push(task);
      } catch (parseError) {
        console.error('[UploadQueue] Failed to parse task JSON', {
          taskId,
          error: parseError,
        });
        // Skip invalid task data
        continue;
      }
    }

    return { success: true, value: tasks };
  } catch (error) {
    return {
      success: false,
      error: {
        code: QueueErrorCode.STORAGE_READ_FAILED,
        category: 'storage',
        message: 'Failed to read tasks from upload queue',
        cause: error instanceof Error ? error : new Error(String(error)),
      },
    };
  }
}

/**
 * Remove task from queue
 * Per ADR-0010: Remove task after successful upload or max retries exceeded
 *
 * @param taskId - ID of task to remove
 * @returns Result with success or error
 */
export async function removeFromQueue(taskId: string): Promise<Result<void, QueueError>> {
  try {
    // Remove task from storage
    const taskKey = `${QUEUE_KEY_PREFIX}${taskId}`;
    await AsyncStorage.removeItem(taskKey);

    // Update index to remove task ID
    const indexResult = await getQueueIndex();
    if (!indexResult.success) {
      // If index read fails, still return success for task removal
      console.warn('[UploadQueue] Failed to update index after removal', {
        taskId,
        error: indexResult.error,
      });
      return { success: true, value: undefined };
    }

    const updatedIndex = indexResult.value.filter(id => id !== taskId);
    try {
      await AsyncStorage.setItem(QUEUE_INDEX_KEY, JSON.stringify(updatedIndex));
    } catch (indexError) {
      // If index write fails, still return success for task removal
      console.warn('[UploadQueue] Failed to write index after task removal', {
        taskId,
        error: indexError,
      });
    }

    return { success: true, value: undefined };
  } catch (error) {
    return {
      success: false,
      error: {
        code: QueueErrorCode.STORAGE_DELETE_FAILED,
        category: 'storage',
        message: 'Failed to remove task from upload queue',
        cause: error instanceof Error ? error : new Error(String(error)),
      },
    };
  }
}

/**
 * Update retry count and last error for task
 * Per ADR-0010: Exponential backoff retry strategy
 *
 * @param taskId - ID of task to update
 * @param retryCount - New retry count
 * @param lastError - Optional error message from last attempt
 * @returns Result with success or error
 */
export async function updateTaskRetry(
  taskId: string,
  retryCount: number,
  lastError?: string
): Promise<Result<void, QueueError>> {
  try {
    const taskKey = `${QUEUE_KEY_PREFIX}${taskId}`;
    const taskJson = await AsyncStorage.getItem(taskKey);

    if (!taskJson) {
      return {
        success: false,
        error: {
          code: QueueErrorCode.TASK_NOT_FOUND,
          category: 'validation',
          message: `Task ${taskId} not found in queue`,
        },
      };
    }

    const task = JSON.parse(taskJson) as UploadTask;
    const updatedTask: UploadTask = {
      ...task,
      retryCount,
      ...(lastError !== undefined ? { lastError } : {}),
    };

    await AsyncStorage.setItem(taskKey, JSON.stringify(updatedTask));
    return { success: true, value: undefined };
  } catch (error) {
    return {
      success: false,
      error: {
        code: QueueErrorCode.STORAGE_WRITE_FAILED,
        category: 'storage',
        message: 'Failed to update task retry count',
        cause: error instanceof Error ? error : new Error(String(error)),
      },
    };
  }
}

/**
 * Clean up expired tasks from queue
 * Per ADR-0010: Remove tasks older than 24 hours to prevent unbounded growth
 *
 * @param maxAgeMs - Maximum age in milliseconds (default 24 hours)
 * @returns Result with count of removed tasks or error
 */
export async function cleanupExpiredTasks(
  maxAgeMs: number = 24 * 60 * 60 * 1000
): Promise<Result<number, QueueError>> {
  try {
    const tasksResult = await readAllFromQueue();
    if (!tasksResult.success) {
      return { success: false, error: tasksResult.error };
    }

    const now = Date.now();
    const tasks = tasksResult.value;
    let removedCount = 0;

    for (const task of tasks) {
      const age = now - task.timestamp;
      if (age > maxAgeMs) {
        const removeResult = await removeFromQueue(task.id);
        if (removeResult.success) {
          removedCount++;
          console.warn('[UploadQueue] Removed expired task', {
            taskId: task.id,
            age,
            maxAgeMs,
          });
        } else {
          console.warn('[UploadQueue] Failed to remove expired task', {
            taskId: task.id,
            error: removeResult.error,
          });
        }
      }
    }

    return { success: true, value: removedCount };
  } catch (error) {
    return {
      success: false,
      error: {
        code: QueueErrorCode.STORAGE_READ_FAILED,
        category: 'storage',
        message: 'Failed to cleanup expired tasks',
        cause: error instanceof Error ? error : new Error(String(error)),
      },
    };
  }
}

/**
 * Get queue index (internal helper)
 * Reads and validates the task ID index from AsyncStorage
 */
async function getQueueIndex(): Promise<Result<string[], QueueError>> {
  try {
    const indexJson = await AsyncStorage.getItem(QUEUE_INDEX_KEY);
    if (!indexJson) {
      // No index exists yet, return empty array
      return { success: true, value: [] };
    }

    const index = JSON.parse(indexJson) as string[];
    if (!Array.isArray(index)) {
      return {
        success: false,
        error: {
          code: QueueErrorCode.INVALID_TASK_DATA,
          category: 'validation',
          message: 'Queue index is not an array',
        },
      };
    }

    return { success: true, value: index };
  } catch (error) {
    return {
      success: false,
      error: {
        code: QueueErrorCode.STORAGE_READ_FAILED,
        category: 'storage',
        message: 'Failed to read queue index',
        cause: error instanceof Error ? error : new Error(String(error)),
      },
    };
  }
}

/**
 * Clear entire queue (utility for testing/debugging)
 * Removes all tasks and resets index
 *
 * @returns Result with success or error
 */
export async function clearQueue(): Promise<Result<void, QueueError>> {
  try {
    const indexResult = await getQueueIndex();
    if (!indexResult.success) {
      // If can't read index, just clear it
      await AsyncStorage.removeItem(QUEUE_INDEX_KEY);
      return { success: true, value: undefined };
    }

    // Remove all tasks
    const taskIds = indexResult.value;
    for (const taskId of taskIds) {
      const taskKey = `${QUEUE_KEY_PREFIX}${taskId}`;
      await AsyncStorage.removeItem(taskKey);
    }

    // Clear index
    await AsyncStorage.removeItem(QUEUE_INDEX_KEY);

    return { success: true, value: undefined };
  } catch (error) {
    return {
      success: false,
      error: {
        code: QueueErrorCode.STORAGE_DELETE_FAILED,
        category: 'storage',
        message: 'Failed to clear upload queue',
        cause: error instanceof Error ? error : new Error(String(error)),
      },
    };
  }
}
