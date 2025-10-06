/**
 * Upload feature public API
 * Exports only the public interface per STANDARDS.md line 26
 */

// Re-export hooks
export { useUpload, UploadStatus } from '../hooks/useUpload';
export type {
  UploadProgress,
  UploadOptions,
  UploadResult,
} from '../hooks/useUpload';

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
