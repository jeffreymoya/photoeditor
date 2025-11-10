/**
 * Unit tests for ImageProcessingOrchestrationService
 *
 * Coverage targets per standards/testing-standards.md#coverage-expectations:
 * - Lines: ≥70%
 * - Branches: ≥60%
 *
 * Test strategy per TASK-0913 clarifications:
 * - Mock all injected dependencies (JobService, S3Service, NotificationService, ProviderFactory, HttpClient)
 * - Cover provider success and fallback paths in editAndFinalizeImage()
 * - Cover batch job progress paths (completion notification, non-batch jobs)
 * - Use deterministic mocks, no real network calls per standards/testing-standards.md
 */

import { Job, JobStatus, GeminiAnalysisResponse, SeedreamEditingResponse, ProviderResponse } from '@photoeditor/shared';

import {
  ImageProcessingOrchestrationService,
  ParsedS3Event,
  HttpClient
} from '../../../src/services/imageProcessing.service';
import { JobService } from '../../../src/services/job.service';
import { S3Service } from '../../../src/services/s3.service';
import { NotificationService } from '../../../src/services/notification.service';
import { ProviderFactory } from '../../../src/providers/factory';
import { AnalysisProvider } from '../../../src/providers/analysis.provider';
import { EditingProvider } from '../../../src/providers/editing.provider';

describe('ImageProcessingOrchestrationService', () => {
  let service: ImageProcessingOrchestrationService;
  let mockJobService: jest.Mocked<JobService>;
  let mockS3Service: jest.Mocked<S3Service>;
  let mockNotificationService: jest.Mocked<NotificationService>;
  let mockProviderFactory: jest.Mocked<ProviderFactory>;
  let mockAnalysisProvider: jest.Mocked<AnalysisProvider>;
  let mockEditingProvider: jest.Mocked<EditingProvider>;
  let mockHttpClient: jest.Mocked<HttpClient>;

  const mockS3Event: ParsedS3Event = {
    bucketName: 'test-bucket',
    objectKey: 'uploads/test-user/test-job/image.jpg',
    userId: 'test-user',
    jobId: 'test-job',
    fileName: 'image.jpg'
  };

  const mockJob: Job = {
    jobId: 'test-job',
    userId: 'test-user',
    status: JobStatus.QUEUED,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    locale: 'en',
    prompt: 'Test prompt',
    expires_at: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
  };

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock JobService
    mockJobService = {
      markJobProcessing: jest.fn(),
      markJobEditing: jest.fn(),
      markJobCompleted: jest.fn(),
      incrementBatchJobProgress: jest.fn()
    } as unknown as jest.Mocked<JobService>;

    // Mock S3Service
    mockS3Service = {
      optimizeAndUploadImage: jest.fn(),
      generatePresignedDownload: jest.fn(),
      uploadObject: jest.fn(),
      copyObject: jest.fn(),
      deleteObject: jest.fn(),
      getTempBucket: jest.fn().mockReturnValue('temp-bucket'),
      getFinalBucket: jest.fn().mockReturnValue('final-bucket'),
      getKeyStrategy: jest.fn().mockReturnValue({
        generateFinalKey: jest.fn((userId, jobId, fileName) => `final/${userId}/${jobId}/${fileName}`)
      })
    } as unknown as jest.Mocked<S3Service>;

    // Mock NotificationService
    mockNotificationService = {
      sendJobStatusNotification: jest.fn(),
      sendBatchJobCompletionNotification: jest.fn()
    } as unknown as jest.Mocked<NotificationService>;

    // Mock Analysis Provider
    mockAnalysisProvider = {
      analyzeImage: jest.fn(),
      getName: jest.fn().mockReturnValue('gemini'),
      isHealthy: jest.fn().mockResolvedValue(true)
    };

    // Mock Editing Provider
    mockEditingProvider = {
      editImage: jest.fn(),
      getName: jest.fn().mockReturnValue('seedream'),
      isHealthy: jest.fn().mockResolvedValue(true)
    };

    // Mock ProviderFactory
    mockProviderFactory = {
      getAnalysisProvider: jest.fn().mockReturnValue(mockAnalysisProvider),
      getEditingProvider: jest.fn().mockReturnValue(mockEditingProvider)
    } as unknown as jest.Mocked<ProviderFactory>;

    // Mock HttpClient
    mockHttpClient = {
      fetch: jest.fn()
    };

    // Create service instance with all mocks
    service = new ImageProcessingOrchestrationService(
      mockJobService,
      mockS3Service,
      mockNotificationService,
      mockProviderFactory,
      mockHttpClient
    );
  });

  describe('processUploadedImage', () => {
    describe('success path with provider editing', () => {
      it('should complete full pipeline with edited image', async () => {
        // Arrange
        const optimizedUrl = 'https://s3.amazonaws.com/optimized-url';
        const editedImageUrl = 'https://provider.com/edited-image.jpg';
        const editedImageBuffer = Buffer.from('edited-image-data');
        const finalKey = 'final/test-user/test-job/image.jpg';

        const analysisResponse: ProviderResponse = {
          success: true,
          data: {
            analysis: 'Detailed analysis of the image',
            confidence: 0.95
          } as GeminiAnalysisResponse,
          duration: 1200,
          provider: 'gemini',
          timestamp: new Date().toISOString()
        };

        const editingResponse: ProviderResponse = {
          success: true,
          data: {
            editedImageUrl,
            processingTime: 3000
          } as SeedreamEditingResponse,
          duration: 3000,
          provider: 'seedream',
          timestamp: new Date().toISOString()
        };

        const completedJob: Job = {
          ...mockJob,
          status: JobStatus.COMPLETED,
          finalKey
        };

        // Mock responses
        mockJobService.markJobProcessing.mockResolvedValue(undefined);
        mockS3Service.optimizeAndUploadImage.mockResolvedValue(undefined);
        mockS3Service.generatePresignedDownload.mockResolvedValue(optimizedUrl);
        mockAnalysisProvider.analyzeImage.mockResolvedValue(analysisResponse);
        mockJobService.markJobEditing.mockResolvedValue(undefined);
        mockEditingProvider.editImage.mockResolvedValue(editingResponse);

        // Mock HTTP fetch for edited image
        const mockResponse = {
          arrayBuffer: jest.fn().mockResolvedValue(editedImageBuffer)
        } as unknown as Response;
        mockHttpClient.fetch.mockResolvedValue(mockResponse);

        mockS3Service.uploadObject.mockResolvedValue(undefined);
        mockJobService.markJobCompleted.mockResolvedValue(completedJob);
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined);
        mockS3Service.deleteObject.mockResolvedValue(undefined);

        // Act
        const result = await service.processUploadedImage(mockJob, mockS3Event);

        // Assert
        expect(result).toEqual({
          finalKey,
          optimizedKey: 'optimized/test-user/test-job/image.jpg'
        });

        // Verify job status transitions
        expect(mockJobService.markJobProcessing).toHaveBeenCalledWith('test-job', mockS3Event.objectKey);
        expect(mockJobService.markJobEditing).toHaveBeenCalledWith('test-job');
        expect(mockJobService.markJobCompleted).toHaveBeenCalledWith('test-job', finalKey);

        // Verify image optimization and analysis
        expect(mockS3Service.optimizeAndUploadImage).toHaveBeenCalledWith(
          'test-bucket',
          'uploads/test-user/test-job/image.jpg',
          'test-bucket',
          'optimized/test-user/test-job/image.jpg'
        );
        expect(mockAnalysisProvider.analyzeImage).toHaveBeenCalledWith({
          imageUrl: optimizedUrl,
          prompt: 'Test prompt'
        });

        // Verify editing with analysis data
        expect(mockEditingProvider.editImage).toHaveBeenCalledWith({
          imageUrl: optimizedUrl,
          analysis: 'Detailed analysis of the image',
          editingInstructions: 'Apply professional photo enhancements based on the analysis'
        });

        // Verify edited image fetch and upload
        expect(mockHttpClient.fetch).toHaveBeenCalledWith(editedImageUrl);
        expect(mockS3Service.uploadObject).toHaveBeenCalledWith(
          'final-bucket',
          finalKey,
          expect.any(Buffer),
          'image/jpeg'
        );

        // Verify notification sent
        expect(mockNotificationService.sendJobStatusNotification).toHaveBeenCalledWith(completedJob);

        // Verify cleanup
        expect(mockS3Service.deleteObject).toHaveBeenCalledWith('test-bucket', mockS3Event.objectKey);
        expect(mockS3Service.deleteObject).toHaveBeenCalledWith('test-bucket', 'optimized/test-user/test-job/image.jpg');
      });

      it('should use default prompt when job prompt is undefined', async () => {
        // Arrange
        const jobWithoutPrompt: Job = { ...mockJob, prompt: undefined };
        const optimizedUrl = 'https://s3.amazonaws.com/optimized-url';

        const analysisResponse: ProviderResponse = {
          success: true,
          data: { analysis: 'Analysis' } as GeminiAnalysisResponse,
          duration: 1200,
          provider: 'gemini',
          timestamp: new Date().toISOString()
        };

        const editingResponse: ProviderResponse = {
          success: true,
          data: { editedImageUrl: 'https://provider.com/edited.jpg' } as SeedreamEditingResponse,
          duration: 3000,
          provider: 'seedream',
          timestamp: new Date().toISOString()
        };

        mockJobService.markJobProcessing.mockResolvedValue(undefined);
        mockS3Service.optimizeAndUploadImage.mockResolvedValue(undefined);
        mockS3Service.generatePresignedDownload.mockResolvedValue(optimizedUrl);
        mockAnalysisProvider.analyzeImage.mockResolvedValue(analysisResponse);
        mockJobService.markJobEditing.mockResolvedValue(undefined);
        mockEditingProvider.editImage.mockResolvedValue(editingResponse);

        const mockResponse = {
          arrayBuffer: jest.fn().mockResolvedValue(Buffer.from('data'))
        } as unknown as Response;
        mockHttpClient.fetch.mockResolvedValue(mockResponse);

        mockS3Service.uploadObject.mockResolvedValue(undefined);
        mockJobService.markJobCompleted.mockResolvedValue({ ...jobWithoutPrompt, status: JobStatus.COMPLETED });
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined);
        mockS3Service.deleteObject.mockResolvedValue(undefined);

        // Act
        await service.processUploadedImage(jobWithoutPrompt, mockS3Event);

        // Assert
        expect(mockAnalysisProvider.analyzeImage).toHaveBeenCalledWith({
          imageUrl: optimizedUrl,
          prompt: 'Analyze this image and provide detailed suggestions for photo editing and enhancement.'
        });
      });
    });

    describe('fallback path when editing fails', () => {
      it('should copy optimized image when editing provider fails', async () => {
        // Arrange
        const optimizedUrl = 'https://s3.amazonaws.com/optimized-url';
        const finalKey = 'final/test-user/test-job/image.jpg';

        const analysisResponse: ProviderResponse = {
          success: true,
          data: { analysis: 'Analysis' } as GeminiAnalysisResponse,
          duration: 1200,
          provider: 'gemini',
          timestamp: new Date().toISOString()
        };

        const editingResponse: ProviderResponse = {
          success: false,
          data: null,
          error: 'Provider unavailable',
          duration: 100,
          provider: 'seedream',
          timestamp: new Date().toISOString()
        };

        const completedJob: Job = {
          ...mockJob,
          status: JobStatus.COMPLETED,
          finalKey
        };

        mockJobService.markJobProcessing.mockResolvedValue(undefined);
        mockS3Service.optimizeAndUploadImage.mockResolvedValue(undefined);
        mockS3Service.generatePresignedDownload.mockResolvedValue(optimizedUrl);
        mockAnalysisProvider.analyzeImage.mockResolvedValue(analysisResponse);
        mockJobService.markJobEditing.mockResolvedValue(undefined);
        mockEditingProvider.editImage.mockResolvedValue(editingResponse);
        mockS3Service.copyObject.mockResolvedValue(undefined);
        mockJobService.markJobCompleted.mockResolvedValue(completedJob);
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined);
        mockS3Service.deleteObject.mockResolvedValue(undefined);

        // Act
        const result = await service.processUploadedImage(mockJob, mockS3Event);

        // Assert
        expect(result).toEqual({
          finalKey,
          optimizedKey: 'optimized/test-user/test-job/image.jpg'
        });

        // Verify fallback: copy optimized to final
        expect(mockS3Service.copyObject).toHaveBeenCalledWith(
          'temp-bucket',
          'optimized/test-user/test-job/image.jpg',
          'final-bucket',
          finalKey
        );

        // Verify no HTTP fetch was made
        expect(mockHttpClient.fetch).not.toHaveBeenCalled();

        // Verify no direct upload (used copy instead)
        expect(mockS3Service.uploadObject).not.toHaveBeenCalled();

        // Job still completes successfully
        expect(mockJobService.markJobCompleted).toHaveBeenCalledWith('test-job', finalKey);
      });

      it('should copy optimized image when editing succeeds but returns no URL', async () => {
        // Arrange
        const optimizedUrl = 'https://s3.amazonaws.com/optimized-url';
        const finalKey = 'final/test-user/test-job/image.jpg';

        const analysisResponse: ProviderResponse = {
          success: true,
          data: { analysis: 'Analysis' } as GeminiAnalysisResponse,
          duration: 1200,
          provider: 'gemini',
          timestamp: new Date().toISOString()
        };

        const editingResponse: ProviderResponse = {
          success: true,
          data: {
            // No editedImageUrl field
            processingTime: 3000
          } as Partial<SeedreamEditingResponse>,
          duration: 3000,
          provider: 'seedream',
          timestamp: new Date().toISOString()
        };

        const completedJob: Job = {
          ...mockJob,
          status: JobStatus.COMPLETED,
          finalKey
        };

        mockJobService.markJobProcessing.mockResolvedValue(undefined);
        mockS3Service.optimizeAndUploadImage.mockResolvedValue(undefined);
        mockS3Service.generatePresignedDownload.mockResolvedValue(optimizedUrl);
        mockAnalysisProvider.analyzeImage.mockResolvedValue(analysisResponse);
        mockJobService.markJobEditing.mockResolvedValue(undefined);
        mockEditingProvider.editImage.mockResolvedValue(editingResponse);
        mockS3Service.copyObject.mockResolvedValue(undefined);
        mockJobService.markJobCompleted.mockResolvedValue(completedJob);
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined);
        mockS3Service.deleteObject.mockResolvedValue(undefined);

        // Act
        const result = await service.processUploadedImage(mockJob, mockS3Event);

        // Assert
        expect(result.finalKey).toBe(finalKey);

        // Verify fallback: copy optimized to final
        expect(mockS3Service.copyObject).toHaveBeenCalledWith(
          'temp-bucket',
          'optimized/test-user/test-job/image.jpg',
          'final-bucket',
          finalKey
        );

        expect(mockHttpClient.fetch).not.toHaveBeenCalled();
        expect(mockS3Service.uploadObject).not.toHaveBeenCalled();
      });
    });

    describe('fallback path when analysis fails', () => {
      it('should use default editing prompt when analysis fails', async () => {
        // Arrange
        const optimizedUrl = 'https://s3.amazonaws.com/optimized-url';
        const editedImageUrl = 'https://provider.com/edited.jpg';
        const finalKey = 'final/test-user/test-job/image.jpg';

        const analysisResponse: ProviderResponse = {
          success: false,
          data: null,
          error: 'Analysis provider failed',
          duration: 100,
          provider: 'gemini',
          timestamp: new Date().toISOString()
        };

        const editingResponse: ProviderResponse = {
          success: true,
          data: { editedImageUrl } as SeedreamEditingResponse,
          duration: 3000,
          provider: 'seedream',
          timestamp: new Date().toISOString()
        };

        mockJobService.markJobProcessing.mockResolvedValue(undefined);
        mockS3Service.optimizeAndUploadImage.mockResolvedValue(undefined);
        mockS3Service.generatePresignedDownload.mockResolvedValue(optimizedUrl);
        mockAnalysisProvider.analyzeImage.mockResolvedValue(analysisResponse);
        mockJobService.markJobEditing.mockResolvedValue(undefined);
        mockEditingProvider.editImage.mockResolvedValue(editingResponse);

        const mockResponse = {
          arrayBuffer: jest.fn().mockResolvedValue(Buffer.from('data'))
        } as unknown as Response;
        mockHttpClient.fetch.mockResolvedValue(mockResponse);

        mockS3Service.uploadObject.mockResolvedValue(undefined);
        mockJobService.markJobCompleted.mockResolvedValue({ ...mockJob, status: JobStatus.COMPLETED, finalKey });
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined);
        mockS3Service.deleteObject.mockResolvedValue(undefined);

        // Act
        await service.processUploadedImage(mockJob, mockS3Event);

        // Assert - should use fallback prompt
        expect(mockEditingProvider.editImage).toHaveBeenCalledWith({
          imageUrl: optimizedUrl,
          analysis: 'Enhance and improve this image',
          editingInstructions: 'Apply professional photo enhancements based on the analysis'
        });

        // Job still completes with edited image
        expect(mockHttpClient.fetch).toHaveBeenCalledWith(editedImageUrl);
        expect(mockS3Service.uploadObject).toHaveBeenCalled();
      });
    });

    describe('batch job progress handling', () => {
      it('should send completion notification when batch job completes', async () => {
        // Arrange
        const batchJob: Job = {
          ...mockJob,
          batchJobId: 'batch-123'
        };

        const updatedBatchJob: Job = {
          jobId: 'batch-123',
          userId: 'test-user',
          status: JobStatus.COMPLETED,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          locale: 'en',
          expires_at: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
        };

        const optimizedUrl = 'https://s3.amazonaws.com/optimized-url';
        const analysisResponse: ProviderResponse = {
          success: true,
          data: { analysis: 'Analysis' } as GeminiAnalysisResponse,
          duration: 1200,
          provider: 'gemini',
          timestamp: new Date().toISOString()
        };

        const editingResponse: ProviderResponse = {
          success: false,
          data: null,
          error: 'Provider unavailable',
          duration: 100,
          provider: 'seedream',
          timestamp: new Date().toISOString()
        };

        mockJobService.markJobProcessing.mockResolvedValue(undefined);
        mockS3Service.optimizeAndUploadImage.mockResolvedValue(undefined);
        mockS3Service.generatePresignedDownload.mockResolvedValue(optimizedUrl);
        mockAnalysisProvider.analyzeImage.mockResolvedValue(analysisResponse);
        mockJobService.markJobEditing.mockResolvedValue(undefined);
        mockEditingProvider.editImage.mockResolvedValue(editingResponse);
        mockS3Service.copyObject.mockResolvedValue(undefined);
        mockJobService.markJobCompleted.mockResolvedValue({ ...batchJob, status: JobStatus.COMPLETED });
        mockJobService.incrementBatchJobProgress.mockResolvedValue(updatedBatchJob);
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined);
        mockNotificationService.sendBatchJobCompletionNotification.mockResolvedValue(undefined);
        mockS3Service.deleteObject.mockResolvedValue(undefined);

        // Act
        await service.processUploadedImage(batchJob, mockS3Event);

        // Assert
        expect(mockJobService.incrementBatchJobProgress).toHaveBeenCalledWith('batch-123');
        expect(mockNotificationService.sendBatchJobCompletionNotification).toHaveBeenCalledWith(updatedBatchJob);
      });

      it('should not send completion notification when batch job still in progress', async () => {
        // Arrange
        const batchJob: Job = {
          ...mockJob,
          batchJobId: 'batch-123'
        };

        const updatedBatchJob: Job = {
          jobId: 'batch-123',
          userId: 'test-user',
          status: JobStatus.PROCESSING,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          locale: 'en',
          expires_at: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
        };

        const optimizedUrl = 'https://s3.amazonaws.com/optimized-url';
        const analysisResponse: ProviderResponse = {
          success: true,
          data: { analysis: 'Analysis' } as GeminiAnalysisResponse,
          duration: 1200,
          provider: 'gemini',
          timestamp: new Date().toISOString()
        };

        const editingResponse: ProviderResponse = {
          success: false,
          data: null,
          error: 'Provider unavailable',
          duration: 100,
          provider: 'seedream',
          timestamp: new Date().toISOString()
        };

        mockJobService.markJobProcessing.mockResolvedValue(undefined);
        mockS3Service.optimizeAndUploadImage.mockResolvedValue(undefined);
        mockS3Service.generatePresignedDownload.mockResolvedValue(optimizedUrl);
        mockAnalysisProvider.analyzeImage.mockResolvedValue(analysisResponse);
        mockJobService.markJobEditing.mockResolvedValue(undefined);
        mockEditingProvider.editImage.mockResolvedValue(editingResponse);
        mockS3Service.copyObject.mockResolvedValue(undefined);
        mockJobService.markJobCompleted.mockResolvedValue({ ...batchJob, status: JobStatus.COMPLETED });
        mockJobService.incrementBatchJobProgress.mockResolvedValue(updatedBatchJob);
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined);
        mockS3Service.deleteObject.mockResolvedValue(undefined);

        // Act
        await service.processUploadedImage(batchJob, mockS3Event);

        // Assert
        expect(mockJobService.incrementBatchJobProgress).toHaveBeenCalledWith('batch-123');
        expect(mockNotificationService.sendBatchJobCompletionNotification).not.toHaveBeenCalled();
      });

      it('should not handle batch progress for non-batch jobs', async () => {
        // Arrange
        const nonBatchJob: Job = {
          ...mockJob,
          batchJobId: undefined
        };

        const optimizedUrl = 'https://s3.amazonaws.com/optimized-url';
        const analysisResponse: ProviderResponse = {
          success: true,
          data: { analysis: 'Analysis' } as GeminiAnalysisResponse,
          duration: 1200,
          provider: 'gemini',
          timestamp: new Date().toISOString()
        };

        const editingResponse: ProviderResponse = {
          success: false,
          data: null,
          error: 'Provider unavailable',
          duration: 100,
          provider: 'seedream',
          timestamp: new Date().toISOString()
        };

        mockJobService.markJobProcessing.mockResolvedValue(undefined);
        mockS3Service.optimizeAndUploadImage.mockResolvedValue(undefined);
        mockS3Service.generatePresignedDownload.mockResolvedValue(optimizedUrl);
        mockAnalysisProvider.analyzeImage.mockResolvedValue(analysisResponse);
        mockJobService.markJobEditing.mockResolvedValue(undefined);
        mockEditingProvider.editImage.mockResolvedValue(editingResponse);
        mockS3Service.copyObject.mockResolvedValue(undefined);
        mockJobService.markJobCompleted.mockResolvedValue({ ...nonBatchJob, status: JobStatus.COMPLETED });
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined);
        mockS3Service.deleteObject.mockResolvedValue(undefined);

        // Act
        await service.processUploadedImage(nonBatchJob, mockS3Event);

        // Assert
        expect(mockJobService.incrementBatchJobProgress).not.toHaveBeenCalled();
        expect(mockNotificationService.sendBatchJobCompletionNotification).not.toHaveBeenCalled();
      });

      it('should propagate error when batch job progress update fails', async () => {
        // Arrange
        const batchJob: Job = {
          ...mockJob,
          batchJobId: 'batch-123'
        };

        const optimizedUrl = 'https://s3.amazonaws.com/optimized-url';
        const analysisResponse: ProviderResponse = {
          success: true,
          data: { analysis: 'Analysis' } as GeminiAnalysisResponse,
          duration: 1200,
          provider: 'gemini',
          timestamp: new Date().toISOString()
        };

        const editingResponse: ProviderResponse = {
          success: false,
          data: null,
          error: 'Provider unavailable',
          duration: 100,
          provider: 'seedream',
          timestamp: new Date().toISOString()
        };

        mockJobService.markJobProcessing.mockResolvedValue(undefined);
        mockS3Service.optimizeAndUploadImage.mockResolvedValue(undefined);
        mockS3Service.generatePresignedDownload.mockResolvedValue(optimizedUrl);
        mockAnalysisProvider.analyzeImage.mockResolvedValue(analysisResponse);
        mockJobService.markJobEditing.mockResolvedValue(undefined);
        mockEditingProvider.editImage.mockResolvedValue(editingResponse);
        mockS3Service.copyObject.mockResolvedValue(undefined);
        mockJobService.markJobCompleted.mockResolvedValue({ ...batchJob, status: JobStatus.COMPLETED });
        mockJobService.incrementBatchJobProgress.mockRejectedValue(new Error('Batch update failed'));

        // Act & Assert
        await expect(service.processUploadedImage(batchJob, mockS3Event))
          .rejects.toThrow('Failed to update batch job progress: Batch update failed');

        expect(mockJobService.incrementBatchJobProgress).toHaveBeenCalledWith('batch-123');
      });
    });
  });
});
