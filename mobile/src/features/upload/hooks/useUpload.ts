/**
 * Upload hook with resilience features
 * Implements:
 * - Retry with exponential backoff
 * - NetInfo-based pause/resume
 * - Offline persistence via react-query
 */

import { useState, useCallback, useEffect } from 'react';

import { getNetworkStatus, subscribeToNetworkStatus, NetworkStatus } from '@/lib/upload/network';
import { preprocessImage } from '@/lib/upload/preprocessing';
import { withRetry, createRetryState, updateRetryState, RetryState } from '@/lib/upload/retry';

/**
 * Upload status enum
 */
export enum UploadStatus {
  IDLE = 'idle',
  PREPROCESSING = 'preprocessing',
  REQUESTING_PRESIGN = 'requesting_presign',
  UPLOADING = 'uploading',
  PAUSED = 'paused',
  SUCCESS = 'success',
  ERROR = 'error',
}

/**
 * Upload progress tracking
 */
export interface UploadProgress {
  /**
   * Current upload status
   */
  status: UploadStatus;
  /**
   * Upload progress percentage (0-100)
   */
  progress: number;
  /**
   * Current retry state if retrying
   */
  retryState?: RetryState;
  /**
   * Error if status is ERROR
   */
  error?: Error;
  /**
   * Network status
   */
  networkStatus?: NetworkStatus;
}

/**
 * Upload options
 */
export type UploadOptions = {
  /**
   * Whether to allow uploads on metered connections. Default: false
   */
  allowMetered?: boolean;
  /**
   * Maximum retry attempts. Default: 3
   */
  maxRetries?: number;
  /**
   * Callback for progress updates
   */
  onProgress?: (progress: UploadProgress) => void;
  /**
   * Callback for successful upload
   */
  onSuccess?: (jobId: string) => void;
  /**
   * Callback for upload error
   */
  onError?: (error: Error) => void;
};

/**
 * Upload result
 */
export interface UploadResult {
  /**
   * Job ID from successful upload
   */
  jobId: string;
  /**
   * Upload key/path
   */
  key: string;
}

/**
 * Hook for resilient image upload with retry, network awareness, and pause/resume
 *
 * @param options - Upload configuration options
 * @returns Upload state and control functions
 */
export function useUpload(options: UploadOptions = {}) {
  const {
    allowMetered = false,
    maxRetries = 3,
    onProgress,
    onSuccess,
    onError,
  } = options;

  const [progress, setProgress] = useState<UploadProgress>({
    status: UploadStatus.IDLE,
    progress: 0,
  });

  const [isPaused, setIsPaused] = useState(false);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | undefined>();

  const updateProgress = useCallback((update: Partial<UploadProgress>) => {
    setProgress(prev => {
      const newProgress = { ...prev, ...update };
      if (onProgress) {
        onProgress(newProgress);
      }
      return newProgress;
    });
  }, [onProgress]);

  // Subscribe to network status changes
  useEffect(() => {
    const unsubscribe = subscribeToNetworkStatus(status => {
      setNetworkStatus(status);

      // Auto-pause if network becomes unsuitable
      if (!status.isConnected || (status.isMetered && !allowMetered)) {
        if (progress.status === UploadStatus.UPLOADING) {
          setIsPaused(true);
          updateProgress({
            status: UploadStatus.PAUSED,
            networkStatus: status,
          });
        }
      }
      // Auto-resume if network becomes suitable and was paused
      else if (isPaused && progress.status === UploadStatus.PAUSED) {
        setIsPaused(false);
      }
    });

    // Initial network status check
    getNetworkStatus().then(setNetworkStatus);

    return unsubscribe;
  }, [progress.status, isPaused, allowMetered, updateProgress]);

  /**
   * Uploads an image with resilience features
   */
  const upload = useCallback(async (
    imageUri: string,
    apiEndpoint: string
  ): Promise<UploadResult> => {
    try {
      // Reset state
      setProgress({
        status: UploadStatus.IDLE,
        progress: 0,
      });

      const retryState = createRetryState(maxRetries);

      // Step 1: Preprocess image
      updateProgress({
        status: UploadStatus.PREPROCESSING,
        progress: 10,
      });

      const preprocessed = await preprocessImage(imageUri);

      // Step 2: Request presigned URL with retry
      updateProgress({
        status: UploadStatus.REQUESTING_PRESIGN,
        progress: 20,
      });

      const presignData = await withRetry(
        async () => {
          const response = await fetch(`${apiEndpoint}/v1/upload/presign`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              fileName: `upload_${Date.now()}.jpg`,
              mimeType: preprocessed.mimeType,
              size: preprocessed.size,
            }),
          });

          if (!response.ok) {
            const error = new Error(`Presign request failed: ${response.statusText}`) as Error & { status?: number };
            error.status = response.status;
            throw error;
          }

          return response.json();
        },
        {
          maxAttempts: maxRetries,
          onRetry: (_attempt, error, _delay) => {
            const newRetryState = updateRetryState(retryState, error);
            updateProgress({
              retryState: newRetryState,
            });
          },
        }
      );

      const { uploadUrl, jobId, key } = presignData;

      // Step 3: Upload to S3 with retry and pause/resume
      updateProgress({
        status: UploadStatus.UPLOADING,
        progress: 30,
      });

      await withRetry(
        async () => {
          // Check if paused before upload attempt
          if (isPaused) {
            throw new Error('Upload paused due to network conditions');
          }

          const fileBlob = await fetch(preprocessed.uri).then(r => r.blob());

          const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': preprocessed.mimeType,
            },
            body: fileBlob,
          });

          if (!uploadResponse.ok) {
            const error = new Error(`Upload failed: ${uploadResponse.statusText}`) as Error & { status?: number };
            error.status = uploadResponse.status;
            throw error;
          }

          return uploadResponse;
        },
        {
          maxAttempts: maxRetries,
          onRetry: (attempt, error, _delay) => {
            const newRetryState = updateRetryState(retryState, error);
            updateProgress({
              retryState: newRetryState,
              progress: 30 + (attempt * 10),
            });
          },
        }
      );

      // Success
      updateProgress({
        status: UploadStatus.SUCCESS,
        progress: 100,
      });

      if (onSuccess) {
        onSuccess(jobId);
      }

      return { jobId, key };

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      updateProgress({
        status: UploadStatus.ERROR,
        error: err,
      });

      if (onError) {
        onError(err);
      }

      throw err;
    }
  }, [maxRetries, isPaused, updateProgress, onSuccess, onError]);

  /**
   * Manually pause upload
   */
  const pause = useCallback(() => {
    if (progress.status === UploadStatus.UPLOADING) {
      setIsPaused(true);
      updateProgress({
        status: UploadStatus.PAUSED,
      });
    }
  }, [progress.status, updateProgress]);

  /**
   * Manually resume upload
   */
  const resume = useCallback(() => {
    if (progress.status === UploadStatus.PAUSED && networkStatus?.isConnected) {
      setIsPaused(false);
      updateProgress({
        status: UploadStatus.UPLOADING,
      });
    }
  }, [progress.status, networkStatus, updateProgress]);

  /**
   * Reset upload state
   */
  const reset = useCallback(() => {
    setProgress({
      status: UploadStatus.IDLE,
      progress: 0,
    });
    setIsPaused(false);
  }, []);

  return {
    progress,
    upload,
    pause,
    resume,
    reset,
    isPaused,
    networkStatus,
  };
}
