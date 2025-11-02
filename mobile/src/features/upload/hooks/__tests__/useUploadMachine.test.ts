/**
 * Tests for useUploadMachine hook
 * Per the Testing Standards: Test hooks with observable UI outcomes
 * Per the Frontend Tier standard: XState machines tested for state transitions
 */

import { renderHook, act } from '@testing-library/react-native';

import { useUploadMachine } from '../useUploadMachine';

describe('useUploadMachine', () => {
  describe('initial state', () => {
    it('should start in idle state', () => {
      const { result } = renderHook(() => useUploadMachine());

      expect(result.current.state).toBe('idle');
      expect(result.current.context.progress).toBe(0);
      expect(result.current.context.retryCount).toBe(0);
      expect(result.current.isInProgress).toBe(false);
      expect(result.current.isPauseable).toBe(false);
      expect(result.current.isTerminal).toBe(false);
    });
  });

  describe('state transitions', () => {
    it('should transition from idle to requesting_presign on START_UPLOAD', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      // preprocessing auto-transitions to requesting_presign
      expect(result.current.state).toBe('requesting_presign');
      expect(result.current.context.imageUri).toBe('file:///test.jpg');
      expect(result.current.context.fileName).toBe('test.jpg');
      expect(result.current.context.fileSize).toBe(1024000);
      expect(result.current.context.mimeType).toBe('image/jpeg');
      expect(result.current.isInProgress).toBe(true);
    });

    it('should transition from requesting_presign to uploading on PRESIGN_SUCCESS', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignSuccess({
          jobId: 'job-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      expect(result.current.state).toBe('uploading');
      expect(result.current.context.jobId).toBe('job-123');
      expect(result.current.context.presignedUrl).toBe(
        'https://s3.amazonaws.com/bucket/key'
      );
      expect(result.current.context.s3Key).toBe('uploads/test.jpg');
      expect(result.current.isInProgress).toBe(true);
      expect(result.current.isPauseable).toBe(true);
    });

    it('should transition from requesting_presign to failed on PRESIGN_FAILURE', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignFailure('Presign request failed');
      });

      expect(result.current.state).toBe('failed');
      expect(result.current.context.error).toBe('Presign request failed');
      expect(result.current.isTerminal).toBe(true);
      expect(result.current.isInProgress).toBe(false);
    });

    it('should update progress during uploading state', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignSuccess({
          jobId: 'job-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      act(() => {
        result.current.updateProgress(50);
      });

      expect(result.current.state).toBe('uploading');
      expect(result.current.context.progress).toBe(50);
    });

    it('should transition from uploading to processing on UPLOAD_SUCCESS', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignSuccess({
          jobId: 'job-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      act(() => {
        result.current.uploadSuccess();
      });

      expect(result.current.state).toBe('processing');
      expect(result.current.context.progress).toBe(100);
      expect(result.current.isInProgress).toBe(true);
    });

    it('should retry upload on UPLOAD_FAILURE when retries available', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignSuccess({
          jobId: 'job-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      act(() => {
        result.current.uploadFailure('Network error');
      });

      expect(result.current.state).toBe('uploading');
      expect(result.current.context.retryCount).toBe(1);
    });

    it('should transition to failed on UPLOAD_FAILURE when max retries exceeded', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignSuccess({
          jobId: 'job-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      // Exceed max retries (default is 3)
      act(() => {
        result.current.uploadFailure('Network error 1');
      });
      act(() => {
        result.current.uploadFailure('Network error 2');
      });
      act(() => {
        result.current.uploadFailure('Network error 3');
      });
      act(() => {
        result.current.uploadFailure('Network error 4');
      });

      expect(result.current.state).toBe('failed');
      expect(result.current.context.retryCount).toBeGreaterThanOrEqual(3);
      expect(result.current.isTerminal).toBe(true);
    });
  });

  describe('pause/resume functionality', () => {
    it('should transition from uploading to paused on PAUSE', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignSuccess({
          jobId: 'job-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      expect(result.current.isPauseable).toBe(true);

      act(() => {
        result.current.pause();
      });

      expect(result.current.state).toBe('paused');
      expect(result.current.isInProgress).toBe(false);
      expect(result.current.isPauseable).toBe(false);
    });

    it('should transition from paused to uploading on RESUME', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignSuccess({
          jobId: 'job-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      act(() => {
        result.current.pause();
      });

      expect(result.current.state).toBe('paused');

      act(() => {
        result.current.resume();
      });

      expect(result.current.state).toBe('uploading');
      expect(result.current.isInProgress).toBe(true);
      expect(result.current.isPauseable).toBe(true);
    });

    it('should preserve context data when paused', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignSuccess({
          jobId: 'job-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      act(() => {
        result.current.updateProgress(50);
      });

      act(() => {
        result.current.pause();
      });

      expect(result.current.context.jobId).toBe('job-123');
      expect(result.current.context.presignedUrl).toBe(
        'https://s3.amazonaws.com/bucket/key'
      );
      expect(result.current.context.progress).toBe(50);
    });
  });

  describe('job processing lifecycle', () => {
    it('should transition from processing to completed on JOB_COMPLETED', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignSuccess({
          jobId: 'job-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      act(() => {
        result.current.uploadSuccess();
      });

      expect(result.current.state).toBe('processing');

      act(() => {
        result.current.jobCompleted();
      });

      expect(result.current.state).toBe('completed');
      expect(result.current.isTerminal).toBe(true);
      expect(result.current.isInProgress).toBe(false);
    });

    it('should transition from processing to failed on JOB_FAILED', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignSuccess({
          jobId: 'job-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      act(() => {
        result.current.uploadSuccess();
      });

      act(() => {
        result.current.jobFailed('Processing error');
      });

      expect(result.current.state).toBe('failed');
      expect(result.current.context.error).toBe('Processing error');
      expect(result.current.isTerminal).toBe(true);
    });

    it('should send JOB_PROCESSING events during processing', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignSuccess({
          jobId: 'job-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      act(() => {
        result.current.uploadSuccess();
      });

      expect(result.current.state).toBe('processing');
      expect(result.current.context.progress).toBe(100);

      act(() => {
        result.current.jobProcessing();
      });

      // JOB_PROCESSING should cap progress at 95 during processing
      expect(result.current.context.progress).toBeLessThanOrEqual(95);
      expect(result.current.state).toBe('processing');
    });
  });

  describe('cancel functionality', () => {
    it('should transition to idle on CANCEL from any state', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignSuccess({
          jobId: 'job-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      act(() => {
        result.current.cancel();
      });

      expect(result.current.state).toBe('idle');
      expect(result.current.context.progress).toBe(0);
      expect(result.current.context.retryCount).toBe(0);
    });

    it('should reset context on cancel', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignSuccess({
          jobId: 'job-456',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      act(() => {
        result.current.updateProgress(75);
      });

      act(() => {
        result.current.cancel();
      });

      expect(result.current.context.progress).toBe(0);
      expect(result.current.context.retryCount).toBe(0);
    });
  });

  describe('retry functionality', () => {
    it('should transition from failed to requesting_presign on RETRY when retries available', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignFailure('Presign failed');
      });

      expect(result.current.state).toBe('failed');

      act(() => {
        result.current.retry();
      });

      // After RETRY from failed state, should transition to preprocessing which auto-transitions to requesting_presign
      expect(result.current.state).toBe('requesting_presign');
      expect(result.current.context.retryCount).toBe(1);
    });

    it('should remain in failed state on RETRY when max retries exceeded', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignSuccess({
          jobId: 'job-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      // Exceed max retries
      act(() => {
        result.current.uploadFailure('Network error 1');
      });
      act(() => {
        result.current.uploadFailure('Network error 2');
      });
      act(() => {
        result.current.uploadFailure('Network error 3');
      });
      act(() => {
        result.current.uploadFailure('Network error 4');
      });

      expect(result.current.state).toBe('failed');

      act(() => {
        result.current.retry();
      });

      // Should remain in failed state
      expect(result.current.state).toBe('failed');
    });
  });

  describe('reset functionality', () => {
    it('should transition to idle on RESET from completed state', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignSuccess({
          jobId: 'job-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      act(() => {
        result.current.uploadSuccess();
      });

      act(() => {
        result.current.jobCompleted();
      });

      expect(result.current.state).toBe('completed');

      act(() => {
        result.current.reset();
      });

      expect(result.current.state).toBe('idle');
      expect(result.current.context.progress).toBe(0);
      expect(result.current.context.retryCount).toBe(0);
    });

    it('should transition to idle on RESET from failed state', () => {
      const { result } = renderHook(() => useUploadMachine());

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      act(() => {
        result.current.presignFailure('Error');
      });

      expect(result.current.state).toBe('failed');

      act(() => {
        result.current.reset();
      });

      expect(result.current.state).toBe('idle');
    });
  });

  describe('helper methods', () => {
    it('should correctly report isInProgress for active states', () => {
      const { result } = renderHook(() => useUploadMachine());

      expect(result.current.isInProgress).toBe(false);

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      expect(result.current.isInProgress).toBe(true);

      act(() => {
        result.current.presignSuccess({
          jobId: 'job-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      expect(result.current.isInProgress).toBe(true);

      act(() => {
        result.current.uploadSuccess();
      });

      expect(result.current.isInProgress).toBe(true);

      act(() => {
        result.current.jobCompleted();
      });

      expect(result.current.isInProgress).toBe(false);
    });

    it('should correctly report isPauseable only during uploading', () => {
      const { result } = renderHook(() => useUploadMachine());

      expect(result.current.isPauseable).toBe(false);

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      expect(result.current.isPauseable).toBe(false);

      act(() => {
        result.current.presignSuccess({
          jobId: 'job-123',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      expect(result.current.isPauseable).toBe(true);

      act(() => {
        result.current.pause();
      });

      expect(result.current.isPauseable).toBe(false);
    });

    it('should correctly report isTerminal for completed and failed states', () => {
      const { result } = renderHook(() => useUploadMachine());

      expect(result.current.isTerminal).toBe(false);

      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      expect(result.current.isTerminal).toBe(false);

      act(() => {
        result.current.presignFailure('Error');
      });

      expect(result.current.isTerminal).toBe(true);

      act(() => {
        result.current.reset();
      });

      expect(result.current.isTerminal).toBe(false);
    });
  });

  describe('full upload lifecycle', () => {
    it('should complete full upload flow from idle to completed', () => {
      const { result } = renderHook(() => useUploadMachine());

      // Start upload
      act(() => {
        result.current.startUpload({
          imageUri: 'file:///test.jpg',
          fileName: 'test.jpg',
          fileSize: 1024000,
          mimeType: 'image/jpeg',
        });
      });

      expect(result.current.state).toBe('requesting_presign');

      // Presign success
      act(() => {
        result.current.presignSuccess({
          jobId: 'job-full-lifecycle',
          presignedUrl: 'https://s3.amazonaws.com/bucket/key',
          s3Key: 'uploads/test.jpg',
        });
      });

      expect(result.current.state).toBe('uploading');

      // Update progress
      act(() => {
        result.current.updateProgress(50);
      });

      expect(result.current.context.progress).toBe(50);

      // Upload success
      act(() => {
        result.current.uploadSuccess();
      });

      expect(result.current.state).toBe('processing');
      expect(result.current.context.progress).toBe(100);

      // Job completed
      act(() => {
        result.current.jobCompleted();
      });

      expect(result.current.state).toBe('completed');
      expect(result.current.context.jobId).toBe('job-full-lifecycle');
    });
  });
});
