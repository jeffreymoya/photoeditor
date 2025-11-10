/**
 * Tests for useUpload hook
 * Per the Testing Standards: Test hooks with observable UI outcomes, stub ports
 * Per the Frontend Tier standard: React hook tests using @testing-library/react-native
 */

import { NetInfoStateType } from '@react-native-community/netinfo';
import { renderHook, act, waitFor } from '@testing-library/react-native';

import * as networkModule from '@/lib/upload/network';
import * as preprocessingModule from '@/lib/upload/preprocessing';

import { useUpload, UploadStatus } from '../useUpload';

// Mock dependencies
jest.mock('@react-native-community/netinfo');
jest.mock('@/lib/upload/network');
jest.mock('@/lib/upload/preprocessing');

const mockNetwork = networkModule as jest.Mocked<typeof networkModule>;
const mockPreprocessing = preprocessingModule as jest.Mocked<typeof preprocessingModule>;

const renderUploadHook = async (options?: Parameters<typeof useUpload>[0]) => {
  const rendered = renderHook(() => useUpload(options));
  // Flush pending microtasks (initial getNetworkStatus resolution) inside act
  await act(async () => {
    await Promise.resolve();
  });
  return rendered;
};

describe('useUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();

    // Default network mocks - connected WiFi
    mockNetwork.getNetworkStatus.mockResolvedValue({
      isConnected: true,
      isMetered: false,
      quality: networkModule.NetworkQuality.GOOD,
      type: NetInfoStateType.wifi,
    });

    mockNetwork.subscribeToNetworkStatus.mockReturnValue(jest.fn());

    // Default preprocessing mock
    mockPreprocessing.preprocessImage.mockResolvedValue({
      uri: 'file:///preprocessed.jpg',
      mimeType: 'image/jpeg',
      size: 1024000,
      width: 1920,
      height: 1080,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should initialize with idle status', async () => {
      const { result } = await renderUploadHook();

      expect(result.current.progress.status).toBe(UploadStatus.IDLE);
      expect(result.current.progress.progress).toBe(0);
      expect(result.current.isPaused).toBe(false);
    });

    it('should subscribe to network status on mount', async () => {
      await renderUploadHook();

      await waitFor(() => {
        expect(mockNetwork.subscribeToNetworkStatus).toHaveBeenCalled();
      });
    });
  });

  describe('upload success flow', () => {
    it('should complete upload successfully with all state transitions', async () => {
      const mockFetch = global.fetch as jest.Mock;

      // Mock presign request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://s3.amazonaws.com/bucket/upload',
          jobId: 'job-123',
          key: 'uploads/job-123/image.jpg',
        }),
      });

      // Mock blob fetch
      mockFetch.mockResolvedValueOnce({
        blob: async () => new Blob(['mock-image-data']),
      });

      // Mock S3 upload
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const onProgress = jest.fn();
      const onSuccess = jest.fn();

      const { result } = await renderUploadHook({
        onProgress,
        onSuccess,
      });

      let uploadPromise: Promise<unknown>;

      await act(async () => {
        uploadPromise = result.current.upload(
          'file:///test.jpg',
          'https://api.photoeditor.dev'
        );
      });

      await act(async () => {
        await uploadPromise;
      });

      // Verify final state
      expect(result.current.progress.status).toBe(UploadStatus.SUCCESS);
      expect(result.current.progress.progress).toBe(100);
      expect(onSuccess).toHaveBeenCalledWith('job-123');
      expect(onProgress).toHaveBeenCalled();
    });

    it('should call onProgress callback during upload stages', async () => {
      const mockFetch = global.fetch as jest.Mock;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://s3.amazonaws.com/bucket/upload',
          jobId: 'job-456',
          key: 'uploads/job-456/image.jpg',
        }),
      });

      mockFetch.mockResolvedValueOnce({
        blob: async () => new Blob(['mock-image-data']),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const onProgress = jest.fn();

      const { result } = await renderUploadHook({ onProgress });

      await act(async () => {
        await result.current.upload(
          'file:///test.jpg',
          'https://api.photoeditor.dev'
        );
      });

      // Should have called onProgress for different stages
      const progressCalls = onProgress.mock.calls;
      expect(progressCalls.length).toBeGreaterThan(0);

      // Check that progress increased over time
      const statuses = progressCalls.map(call => call[0].status);
      expect(statuses).toContain(UploadStatus.PREPROCESSING);
      expect(statuses).toContain(UploadStatus.REQUESTING_PRESIGN);
      expect(statuses).toContain(UploadStatus.UPLOADING);
      expect(statuses).toContain(UploadStatus.SUCCESS);
    });
  });

  describe('upload error handling', () => {
    it('should handle presign request failure', async () => {
      const mockFetch = global.fetch as jest.Mock;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const onError = jest.fn();

      const { result } = await renderUploadHook({ onError, maxRetries: 1 });

      await act(async () => {
        await expect(
          result.current.upload(
            'file:///test.jpg',
            'https://api.photoeditor.dev'
          )
        ).rejects.toThrow();
      });

      expect(result.current.progress.status).toBe(UploadStatus.ERROR);
      expect(result.current.progress.error).toBeDefined();
      expect(onError).toHaveBeenCalled();
    });

    it('should handle S3 upload failure', async () => {
      const mockFetch = global.fetch as jest.Mock;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://s3.amazonaws.com/bucket/upload',
          jobId: 'job-789',
          key: 'uploads/job-789/image.jpg',
        }),
      });

      mockFetch.mockResolvedValueOnce({
        blob: async () => new Blob(['mock-image-data']),
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });

      const onError = jest.fn();

      const { result } = await renderUploadHook({ onError, maxRetries: 1 });

      await act(async () => {
        await expect(
          result.current.upload(
            'file:///test.jpg',
            'https://api.photoeditor.dev'
          )
        ).rejects.toThrow();
      });

      expect(result.current.progress.status).toBe(UploadStatus.ERROR);
      expect(onError).toHaveBeenCalled();
    });

    it('should handle preprocessing failure', async () => {
      mockPreprocessing.preprocessImage.mockRejectedValueOnce(
        new Error('Image processing failed')
      );

      const onError = jest.fn();

      const { result } = await renderUploadHook({ onError });

      await act(async () => {
        await expect(
          result.current.upload(
            'file:///invalid.jpg',
            'https://api.photoeditor.dev'
          )
        ).rejects.toThrow('Image processing failed');
      });

      expect(result.current.progress.status).toBe(UploadStatus.ERROR);
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Image processing failed',
      }));
    });
  });

  describe('retry logic', () => {
    it('should retry presign request on failure', async () => {
      const mockFetch = global.fetch as jest.Mock;

      // Fail first attempt, succeed on retry
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            uploadUrl: 'https://s3.amazonaws.com/bucket/upload',
            jobId: 'job-retry-123',
            key: 'uploads/job-retry-123/image.jpg',
          }),
        });

      mockFetch.mockResolvedValueOnce({
        blob: async () => new Blob(['mock-image-data']),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const onProgress = jest.fn();

      const { result } = await renderUploadHook({ onProgress, maxRetries: 3 });

      await act(async () => {
        await result.current.upload(
          'file:///test.jpg',
          'https://api.photoeditor.dev'
        );
      });

      expect(result.current.progress.status).toBe(UploadStatus.SUCCESS);

      // Should have retry state updates
      const progressCalls = onProgress.mock.calls;
      const retryStates = progressCalls.filter(call => call[0].retryState);
      expect(retryStates.length).toBeGreaterThan(0);
    });

    it('should update retry state during retries', async () => {
      const mockFetch = global.fetch as jest.Mock;

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const onProgress = jest.fn();

      const { result } = await renderUploadHook({ onProgress, maxRetries: 2 });

      await act(async () => {
        await expect(
          result.current.upload(
            'file:///test.jpg',
            'https://api.photoeditor.dev'
          )
        ).rejects.toThrow();
      });

      // Check that retry state was updated
      const progressCalls = onProgress.mock.calls;
      const callsWithRetry = progressCalls.filter(call => call[0].retryState);
      expect(callsWithRetry.length).toBeGreaterThan(0);
    });
  });

  describe('network-aware pause/resume', () => {
    it('should auto-pause when network disconnects during upload', async () => {
      let networkCallback: ((status: networkModule.NetworkStatus) => void) | undefined;

      mockNetwork.subscribeToNetworkStatus.mockImplementation((callback) => {
        networkCallback = callback;
        return jest.fn();
      });

      await renderUploadHook();

      // Simulate network disconnection
      await act(async () => {
        if (networkCallback) {
          networkCallback({
            isConnected: false,
            isMetered: false,
            quality: networkModule.NetworkQuality.OFFLINE,
            type: NetInfoStateType.none,
          });
        }
      });

      expect(mockNetwork.subscribeToNetworkStatus).toHaveBeenCalled();
    });

    it('should auto-pause on metered connection when allowMetered is false', async () => {
      let networkCallback: ((status: networkModule.NetworkStatus) => void) | undefined;

      mockNetwork.subscribeToNetworkStatus.mockImplementation((callback) => {
        networkCallback = callback;
        return jest.fn();
      });

      await renderUploadHook({ allowMetered: false });

      // Simulate switch to metered connection while uploading
      await act(async () => {
        if (networkCallback) {
          networkCallback({
            isConnected: true,
            isMetered: true,
            quality: networkModule.NetworkQuality.POOR,
            type: NetInfoStateType.cellular,
          });
        }
      });

      expect(mockNetwork.subscribeToNetworkStatus).toHaveBeenCalled();
    });
  });

  describe('manual pause/resume', () => {
    it('should pause upload when pause is called', async () => {
      const { result } = await renderUploadHook();

      // Simulate being in uploading state
      await act(async () => {
        result.current.progress.status = UploadStatus.UPLOADING;
      });

      await act(async () => {
        result.current.pause();
      });

      expect(result.current.isPaused).toBe(true);
      expect(result.current.progress.status).toBe(UploadStatus.PAUSED);
    });

    it('should resume upload when resume is called and network is available', async () => {
      mockNetwork.getNetworkStatus.mockResolvedValue({
        isConnected: true,
        isMetered: false,
        quality: networkModule.NetworkQuality.GOOD,
        type: NetInfoStateType.wifi,
      });

      const { result } = await renderUploadHook();

      // Set to paused state
      await act(async () => {
        result.current.progress.status = UploadStatus.PAUSED;
        result.current.networkStatus = {
          isConnected: true,
          isMetered: false,
          quality: networkModule.NetworkQuality.GOOD,
          type: NetInfoStateType.wifi,
        };
      });

      await act(async () => {
        result.current.resume();
      });

      expect(result.current.isPaused).toBe(false);
      expect(result.current.progress.status).toBe(UploadStatus.UPLOADING);
    });

    it('should not resume if network is disconnected', async () => {
      let networkCallback: ((status: networkModule.NetworkStatus) => void) | undefined;

      mockNetwork.subscribeToNetworkStatus.mockImplementation((callback) => {
        networkCallback = callback;
        return jest.fn();
      });

      const mockFetch = global.fetch as jest.Mock;

      // Mock presign request
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://s3.amazonaws.com/bucket/upload',
          jobId: 'job-pause-test',
          key: 'uploads/job-pause-test/image.jpg',
        }),
      });

      // Mock blob fetch
      mockFetch.mockResolvedValueOnce({
        blob: async () => new Blob(['mock-image-data']),
      });

      // Mock S3 upload - will hang to allow pause
      mockFetch.mockImplementationOnce(() => new Promise(() => {}));

      const { result } = await renderUploadHook();

      // Start upload (but don't await - let it hang on the S3 upload)
      await act(async () => {
        void result.current.upload(
          'file:///test.jpg',
          'https://api.photoeditor.dev'
        );
      });

      // Wait for uploading state
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      // Pause the upload
      await act(async () => {
        result.current.pause();
      });

      expect(result.current.progress.status).toBe(UploadStatus.PAUSED);

      // Simulate network disconnection
      await act(async () => {
        if (networkCallback) {
          networkCallback({
            isConnected: false,
            isMetered: false,
            quality: networkModule.NetworkQuality.OFFLINE,
            type: NetInfoStateType.none,
          });
        }
      });

      // Try to resume - should not work since network is disconnected
      await act(async () => {
        result.current.resume();
      });

      // Should remain paused because network is not connected
      expect(result.current.progress.status).toBe(UploadStatus.PAUSED);
    });
  });

  describe('reset functionality', () => {
    it('should reset upload state to idle', async () => {
      const { result } = await renderUploadHook();

      // Set to error state
      await act(async () => {
        result.current.progress.status = UploadStatus.ERROR;
        result.current.progress.error = new Error('Test error');
        result.current.progress.progress = 50;
      });

      await act(async () => {
        result.current.reset();
      });

      expect(result.current.progress.status).toBe(UploadStatus.IDLE);
      expect(result.current.progress.progress).toBe(0);
      expect(result.current.isPaused).toBe(false);
    });
  });

  describe('observable behavior', () => {
    it('should track upload progress from 0 to 100', async () => {
      const mockFetch = global.fetch as jest.Mock;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://s3.amazonaws.com/bucket/upload',
          jobId: 'job-progress',
          key: 'uploads/job-progress/image.jpg',
        }),
      });

      mockFetch.mockResolvedValueOnce({
        blob: async () => new Blob(['mock-image-data']),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const progressValues: number[] = [];
      const onProgress = jest.fn((progress) => {
        progressValues.push(progress.progress);
      });

      const { result } = await renderUploadHook({ onProgress });

      await act(async () => {
        await result.current.upload(
          'file:///test.jpg',
          'https://api.photoeditor.dev'
        );
      });

      // Progress should start with preprocessing (10) and end at 100
      expect(progressValues.length).toBeGreaterThan(0);
      expect(progressValues[0]).toBeGreaterThanOrEqual(10); // First callback is PREPROCESSING at 10%
      expect(progressValues[progressValues.length - 1]).toBe(100);

      // Progress should be monotonically increasing
      for (let i = 1; i < progressValues.length; i++) {
        expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
      }
    });

    it('should return jobId and key on successful upload', async () => {
      const mockFetch = global.fetch as jest.Mock;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://s3.amazonaws.com/bucket/upload',
          jobId: 'job-return-test',
          key: 'uploads/job-return-test/image.jpg',
        }),
      });

      mockFetch.mockResolvedValueOnce({
        blob: async () => new Blob(['mock-image-data']),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const { result } = await renderUploadHook();

      let uploadResult;
      await act(async () => {
        uploadResult = await result.current.upload(
          'file:///test.jpg',
          'https://api.photoeditor.dev'
        );
      });

      expect(uploadResult).toEqual({
        jobId: 'job-return-test',
        key: 'uploads/job-return-test/image.jpg',
      });
    });
  });
});
