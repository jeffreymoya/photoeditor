/**
 * React hook for XState upload machine
 * Per the Frontend Tier standard: XState for job lifecycle with testable transitions
 * Per the TypeScript Standards: Named exports, typed returns
 */

import { useMachine } from '@xstate/react';
import { useCallback } from 'react';

import {
  uploadMachine,
  type UploadContext,
  type UploadStateValue,
  isUploadInProgress,
  isUploadPauseable,
  isUploadTerminal,
} from '../machines/uploadMachine';

import type { InterpreterFrom } from 'xstate';


/**
 * Return type for useUploadMachine hook
 */
export interface UseUploadMachineResult {
  /** Current state value */
  state: UploadStateValue;
  /** Current context data */
  context: UploadContext;
  /** Check if upload is in progress */
  isInProgress: boolean;
  /** Check if upload can be paused */
  isPauseable: boolean;
  /** Check if upload is in terminal state */
  isTerminal: boolean;
  /** Start upload */
  startUpload: (params: {
    imageUri: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  }) => void;
  /** Send presign success */
  presignSuccess: (params: { jobId: string; presignedUrl: string; s3Key: string }) => void;
  /** Send presign failure */
  presignFailure: (error: string) => void;
  /** Update upload progress */
  updateProgress: (progress: number) => void;
  /** Upload success */
  uploadSuccess: () => void;
  /** Upload failure */
  uploadFailure: (error: string) => void;
  /** Job processing */
  jobProcessing: () => void;
  /** Job completed */
  jobCompleted: () => void;
  /** Job failed */
  jobFailed: (error: string) => void;
  /** Pause upload */
  pause: () => void;
  /** Resume upload */
  resume: () => void;
  /** Retry upload */
  retry: () => void;
  /** Cancel upload */
  cancel: () => void;
  /** Reset to idle */
  reset: () => void;
}

/**
 * Hook to manage upload state machine
 * Provides type-safe interface to upload machine with convenience methods
 *
 * @returns Upload machine state and control methods
 */
export function useUploadMachine(): UseUploadMachineResult {
  const [state, send] = useMachine(uploadMachine);

  const currentState = state.value as UploadStateValue;
  const context = state.context;

  // Convenience methods with type-safe event sending
  const startUpload = useCallback(
    (params: { imageUri: string; fileName: string; fileSize: number; mimeType: string }) => {
      send({ type: 'START_UPLOAD', ...params });
    },
    [send]
  );

  const presignSuccess = useCallback(
    (params: { jobId: string; presignedUrl: string; s3Key: string }) => {
      send({ type: 'PRESIGN_SUCCESS', ...params });
    },
    [send]
  );

  const presignFailure = useCallback(
    (error: string) => {
      send({ type: 'PRESIGN_FAILURE', error });
    },
    [send]
  );

  const updateProgress = useCallback(
    (progress: number) => {
      send({ type: 'UPLOAD_PROGRESS', progress });
    },
    [send]
  );

  const uploadSuccess = useCallback(() => {
    send({ type: 'UPLOAD_SUCCESS' });
  }, [send]);

  const uploadFailure = useCallback(
    (error: string) => {
      send({ type: 'UPLOAD_FAILURE', error });
    },
    [send]
  );

  const jobProcessing = useCallback(() => {
    send({ type: 'JOB_PROCESSING' });
  }, [send]);

  const jobCompleted = useCallback(() => {
    send({ type: 'JOB_COMPLETED' });
  }, [send]);

  const jobFailed = useCallback(
    (error: string) => {
      send({ type: 'JOB_FAILED', error });
    },
    [send]
  );

  const pause = useCallback(() => {
    send({ type: 'PAUSE' });
  }, [send]);

  const resume = useCallback(() => {
    send({ type: 'RESUME' });
  }, [send]);

  const retry = useCallback(() => {
    send({ type: 'RETRY' });
  }, [send]);

  const cancel = useCallback(() => {
    send({ type: 'CANCEL' });
  }, [send]);

  const reset = useCallback(() => {
    send({ type: 'RESET' });
  }, [send]);

  return {
    state: currentState,
    context,
    isInProgress: isUploadInProgress(currentState),
    isPauseable: isUploadPauseable(currentState),
    isTerminal: isUploadTerminal(currentState),
    startUpload,
    presignSuccess,
    presignFailure,
    updateProgress,
    uploadSuccess,
    uploadFailure,
    jobProcessing,
    jobCompleted,
    jobFailed,
    pause,
    resume,
    retry,
    cancel,
    reset,
  };
}

/**
 * Export type for external consumption
 */
export type UploadMachineInterpreter = InterpreterFrom<typeof uploadMachine>;
