/**
 * Upload feature public API
 * Exports only the public interface per the Frontend Tier standard
 * Per the TypeScript Standards: Named exports only, minimal public surface
 */

// Re-export legacy hooks (for backward compatibility during migration)
export { useUpload, UploadStatus } from '../hooks/useUpload';
export type {
  UploadProgress,
  UploadOptions,
  UploadResult,
} from '../hooks/useUpload';

// Re-export XState machine hook (NEW - TASK-0819)
export { useUploadMachine } from '../hooks/useUploadMachine';
export type { UseUploadMachineResult } from '../hooks/useUploadMachine';

// Re-export machine types for external usage
export type {
  UploadContext,
  UploadEvent,
  UploadStateValue,
} from '../machines/uploadMachine';
export {
  isUploadInProgress,
  isUploadPauseable,
  isUploadTerminal,
} from '../machines/uploadMachine';

// Re-export RTK Query hooks (NEW - TASK-0819)
export {
  uploadApi,
  useRequestPresignUrlMutation,
  useRequestBatchPresignUrlsMutation,
  useGetJobStatusQuery,
  useGetBatchJobStatusQuery,
  useHealthCheckQuery,
  useLazyGetJobStatusQuery,
  useLazyGetBatchJobStatusQuery,
  uploadToS3,
} from '@/store/uploadApi';
export type { S3UploadError } from '@/store/uploadApi';

// Re-export types from lib utilities
export type {
  PreprocessOptions,
  PreprocessedImage,
  SupportedFormat,
} from '@/lib/upload/preprocessing';

export type {
  NetworkStatus,
  NetworkQuality,
} from '@/lib/upload/network';

export type {
  RetryOptions,
  RetryState,
} from '@/lib/upload/retry';
