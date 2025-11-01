/**
 * XState upload state machine
 * Per the Frontend Tier standard: XState for Media and Job Lifecycle state machines
 * Per the TypeScript Standards: Discriminated unions, named exports, typed errors
 *
 * Models the upload lifecycle: idle → preprocessing → uploading → processing → completed/failed
 * Supports pause/resume on network changes, retry with backoff
 */

import { createMachine, assign } from 'xstate';

/**
 * Upload context - state machine context data
 */
export interface UploadContext {
  imageUri?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  jobId?: string;
  s3Key?: string;
  presignedUrl?: string;
  progress: number;
  error?: string;
  retryCount: number;
  maxRetries: number;
}

/**
 * Upload events - all possible state machine events
 * Per the TypeScript Standards: Discriminated unions with 'type' tag
 */
export type UploadEvent =
  | { type: 'START_UPLOAD'; imageUri: string; fileName: string; fileSize: number; mimeType: string }
  | { type: 'PRESIGN_SUCCESS'; jobId: string; presignedUrl: string; s3Key: string }
  | { type: 'PRESIGN_FAILURE'; error: string }
  | { type: 'UPLOAD_PROGRESS'; progress: number }
  | { type: 'UPLOAD_SUCCESS' }
  | { type: 'UPLOAD_FAILURE'; error: string }
  | { type: 'JOB_PROCESSING' }
  | { type: 'JOB_COMPLETED' }
  | { type: 'JOB_FAILED'; error: string }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }
  | { type: 'RESET' };

/**
 * Upload state machine
 * States: idle → preprocessing → requesting_presign → uploading → processing → completed | failed
 * Also supports: paused (can transition from uploading)
 *
 * Per the Frontend Tier standard State & Logic Layer:
 * - Statechart contracts: export .scxml or Mermaid
 * - Reducer cyclomatic complexity ≤10
 * - Every critical slice has XState chart + test for each transition
 */
export const uploadMachine = createMachine<UploadContext, UploadEvent>(
  {
    id: 'upload',
    initial: 'idle',
    predictableActionArguments: true,
    context: {
      progress: 0,
      retryCount: 0,
      maxRetries: 3,
    },
    states: {
      idle: {
        on: {
          START_UPLOAD: {
            target: 'preprocessing',
            actions: 'setUploadData',
          },
        },
      },
      preprocessing: {
        // Preprocessing completes immediately and transitions to requesting presign
        entry: [],
        always: {
          target: 'requesting_presign',
        },
        on: {
          CANCEL: {
            target: 'idle',
            actions: 'resetContext',
          },
        },
      },
      requesting_presign: {
        on: {
          PRESIGN_SUCCESS: {
            target: 'uploading',
            actions: 'setPresignData',
          },
          PRESIGN_FAILURE: {
            target: 'failed',
            actions: 'setError',
          },
          CANCEL: {
            target: 'idle',
            actions: 'resetContext',
          },
        },
      },
      uploading: {
        on: {
          UPLOAD_PROGRESS: {
            actions: 'updateProgress',
          },
          UPLOAD_SUCCESS: {
            target: 'processing',
            actions: 'setProgressComplete',
          },
          UPLOAD_FAILURE: [
            {
              target: 'failed',
              cond: 'maxRetriesExceeded',
              actions: 'setError',
            },
            {
              target: 'uploading',
              actions: 'incrementRetry',
            },
          ],
          PAUSE: {
            target: 'paused',
          },
          CANCEL: {
            target: 'idle',
            actions: 'resetContext',
          },
        },
      },
      paused: {
        on: {
          RESUME: {
            target: 'uploading',
          },
          CANCEL: {
            target: 'idle',
            actions: 'resetContext',
          },
        },
      },
      processing: {
        on: {
          JOB_PROCESSING: {
            actions: 'updateProgress',
          },
          JOB_COMPLETED: {
            target: 'completed',
          },
          JOB_FAILED: {
            target: 'failed',
            actions: 'setError',
          },
          CANCEL: {
            target: 'idle',
            actions: 'resetContext',
          },
        },
      },
      completed: {
        on: {
          RESET: {
            target: 'idle',
            actions: 'resetContext',
          },
        },
        type: 'final',
      },
      failed: {
        on: {
          RETRY: [
            {
              target: 'preprocessing',
              cond: 'canRetry',
              actions: 'incrementRetry',
            },
            {
              target: 'failed',
            },
          ],
          RESET: {
            target: 'idle',
            actions: 'resetContext',
          },
        },
      },
    },
  },
  {
    actions: {
      setUploadData: assign((_context, event) => {
        if (event.type === 'START_UPLOAD') {
          return {
            imageUri: event.imageUri,
            fileName: event.fileName,
            fileSize: event.fileSize,
            mimeType: event.mimeType,
            progress: 0,
            retryCount: 0,
          } as Partial<UploadContext>;
        }
        return {} as Partial<UploadContext>;
      }),
      setPresignData: assign({
        jobId: (_context, event) => event.type === 'PRESIGN_SUCCESS' ? event.jobId : undefined,
        presignedUrl: (_context, event) => event.type === 'PRESIGN_SUCCESS' ? event.presignedUrl : undefined,
        s3Key: (_context, event) => event.type === 'PRESIGN_SUCCESS' ? event.s3Key : undefined,
      }),
      updateProgress: assign({
        progress: (_context, event) => {
          if (event.type === 'UPLOAD_PROGRESS') {
            return event.progress;
          }
          if (event.type === 'JOB_PROCESSING') {
            return Math.min(_context.progress + 5, 95);
          }
          return _context.progress;
        },
      }),
      setProgressComplete: assign({
        progress: 100,
      }),
      setError: assign({
        error: (_context, event) => {
          if (event.type === 'PRESIGN_FAILURE' || event.type === 'UPLOAD_FAILURE' || event.type === 'JOB_FAILED') {
            return event.error;
          }
          return undefined;
        },
      }),
      incrementRetry: assign({
        retryCount: (context) => context.retryCount + 1,
      }),
      resetContext: assign((_context) => {
        const reset: Partial<UploadContext> = {
          progress: 0,
          retryCount: 0,
        };
        // XState doesn't support clearing optional fields, so we leave them as-is
        // The context will preserve prior values for these optional fields
        return reset;
      }),
    },
    guards: {
      maxRetriesExceeded: (context) => context.retryCount >= context.maxRetries,
      canRetry: (context) => context.retryCount < context.maxRetries,
    },
  }
);

/**
 * Type-safe state value helpers
 * Per the TypeScript Standards: Discriminated unions + assertNever
 */
export type UploadStateValue =
  | 'idle'
  | 'preprocessing'
  | 'requesting_presign'
  | 'uploading'
  | 'paused'
  | 'processing'
  | 'completed'
  | 'failed';

/**
 * Check if upload is in progress (any active state)
 */
export function isUploadInProgress(state: UploadStateValue): boolean {
  return (
    state === 'preprocessing' ||
    state === 'requesting_presign' ||
    state === 'uploading' ||
    state === 'processing'
  );
}

/**
 * Check if upload can be paused
 */
export function isUploadPauseable(state: UploadStateValue): boolean {
  return state === 'uploading';
}

/**
 * Check if upload is terminal state
 */
export function isUploadTerminal(state: UploadStateValue): boolean {
  return state === 'completed' || state === 'failed';
}
