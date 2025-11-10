/**
 * Image Processing Orchestration Service
 *
 * Orchestrates the full image processing pipeline:
 * - Mark job as processing
 * - Optimize and analyze image
 * - Edit image based on analysis
 * - Finalize and store result
 * - Handle batch job progress
 * - Send notifications
 * - Cleanup temporary files
 *
 * This service reduces handler complexity by encapsulating the entire workflow
 * in a single, testable service method.
 *
 * @module services/imageProcessing
 */

import { Job, JobStatus, GeminiAnalysisResponse, SeedreamEditingResponse } from '@photoeditor/shared';

import { ProviderFactory } from '@backend/core';

import { JobService } from './job.service';
import { NotificationService } from './notification.service';
import { S3Service } from './s3.service';

/**
 * HttpClient interface for fetch operations
 * Injected to enable deterministic testing per standards/typescript.md#analyzability
 */
export interface HttpClient {
  fetch(url: string): Promise<Response>;
}

/**
 * Parsed S3 event containing upload information
 */
export interface ParsedS3Event {
  bucketName: string;
  objectKey: string;
  userId: string;
  jobId: string;
  fileName: string;
}

/**
 * Result of successful image processing
 */
export interface ProcessedImageResult {
  finalKey: string;
  optimizedKey: string;
}

/**
 * Service orchestrating the complete image processing workflow
 *
 * Complexity: Designed to keep handlers ≤10 complexity by encapsulating
 * all processing logic in a single service method
 */
export class ImageProcessingOrchestrationService {
  constructor(
    private readonly jobService: JobService,
    private readonly s3Service: S3Service,
    private readonly notificationService: NotificationService,
    private readonly providerFactory: ProviderFactory,
    private readonly httpClient: HttpClient = { fetch: (url: string) => fetch(url) }
  ) {}

  /**
   * Processes an uploaded image through the complete pipeline
   *
   * Steps:
   * 1. Mark job as processing
   * 2. Optimize and analyze image
   * 3. Mark job as editing
   * 4. Edit image based on analysis
   * 5. Mark job as complete
   * 6. Handle batch job progress (if applicable)
   * 7. Send notifications
   * 8. Cleanup temporary files
   *
   * @param job - Job entity from database
   * @param s3Event - Parsed S3 event with upload details
   * @returns Result containing final S3 key and optimized key
   */
  async processUploadedImage(
    job: Job,
    s3Event: ParsedS3Event
  ): Promise<ProcessedImageResult> {
    const { bucketName, objectKey, userId, jobId, fileName } = s3Event;

    // Step 1: Mark job as processing
    await this.jobService.markJobProcessing(jobId, objectKey);

    // Step 2: Optimize and analyze image
    const { optimizedKey, analysisResult } = await this.analyzeImage(
      bucketName,
      objectKey,
      job.prompt || 'Analyze this image and provide detailed suggestions for photo editing and enhancement.'
    );

    // Step 3: Mark job as editing
    await this.jobService.markJobEditing(jobId);

    // Step 4: Edit image and upload to final location
    const optimizedUrl = await this.s3Service.generatePresignedDownload(bucketName, optimizedKey, 300);
    const finalKey = await this.editAndFinalizeImage(
      optimizedUrl,
      optimizedKey,
      analysisResult,
      userId,
      jobId,
      fileName
    );

    // Step 5: Mark job as complete
    const completedJob = await this.jobService.markJobCompleted(jobId, finalKey);

    // Step 6: Handle batch job progress (if part of batch)
    if (job.batchJobId) {
      await this.handleBatchJobProgress(job.batchJobId, jobId);
    }

    // Step 7: Send job completion notification
    await this.notificationService.sendJobStatusNotification(completedJob);

    // Step 8: Cleanup temporary files
    await this.s3Service.deleteObject(bucketName, objectKey);
    await this.s3Service.deleteObject(bucketName, optimizedKey);

    return { finalKey, optimizedKey };
  }

  /**
   * Optimizes image and performs AI analysis
   *
   * @private
   */
  private async analyzeImage(
    bucketName: string,
    objectKey: string,
    userPrompt: string
  ): Promise<{ optimizedKey: string; analysisResult: { success: boolean; data?: unknown } }> {
    // Optimize image
    const optimizedKey = objectKey.replace(/^uploads\//, 'optimized/');
    await this.s3Service.optimizeAndUploadImage(bucketName, objectKey, bucketName, optimizedKey);

    // Generate presigned URL for analysis
    const optimizedUrl = await this.s3Service.generatePresignedDownload(bucketName, optimizedKey, 300);

    // Analyze image using AI provider
    const analysisProvider = this.providerFactory.getAnalysisProvider();
    const analysisRequest = { imageUrl: optimizedUrl, prompt: userPrompt };
    const analysisResult = await analysisProvider.analyzeImage(analysisRequest);

    return { optimizedKey, analysisResult };
  }

  /**
   * Edits image using AI provider and uploads to final S3 location
   *
   * @private
   */
  private async editAndFinalizeImage(
    optimizedUrl: string,
    optimizedKey: string,
    analysisResult: { success: boolean; data?: unknown },
    userId: string,
    jobId: string,
    fileName: string
  ): Promise<string> {
    const keyStrategy = this.s3Service.getKeyStrategy();
    const finalKey = keyStrategy.generateFinalKey(userId, jobId, fileName);

    // Prepare editing request
    const editingProvider = this.providerFactory.getEditingProvider();
    const analysisData = analysisResult.success ? analysisResult.data as GeminiAnalysisResponse : null;

    const editingRequest = {
      imageUrl: optimizedUrl,
      analysis: analysisData?.analysis || 'Enhance and improve this image',
      editingInstructions: 'Apply professional photo enhancements based on the analysis'
    };

    const editedImageResult = await editingProvider.editImage(editingRequest);

    // Upload edited image or fallback to optimized image
    const editedImageData = editedImageResult.success ? editedImageResult.data as SeedreamEditingResponse : null;

    if (editedImageResult.success && editedImageData?.editedImageUrl) {
      // Fetch and upload edited image
      const editedImageResponse = await this.httpClient.fetch(editedImageData.editedImageUrl);
      const editedImageBuffer = await editedImageResponse.arrayBuffer();

      await this.s3Service.uploadObject(
        this.s3Service.getFinalBucket(),
        finalKey,
        Buffer.from(editedImageBuffer),
        'image/jpeg'
      );
    } else {
      // Fallback: copy optimized image to final location
      await this.s3Service.copyObject(
        this.s3Service.getTempBucket(),
        optimizedKey,
        this.s3Service.getFinalBucket(),
        finalKey
      );
    }

    return finalKey;
  }

  /**
   * Handles batch job progress tracking and notifications
   *
   * @private
   */
  private async handleBatchJobProgress(batchJobId: string, _jobId: string): Promise<void> {
    try {
      const updatedBatchJob = await this.jobService.incrementBatchJobProgress(batchJobId);

      // Send batch completion notification if all jobs finished
      if (updatedBatchJob.status === JobStatus.COMPLETED) {
        await this.notificationService.sendBatchJobCompletionNotification(updatedBatchJob);
      }
    } catch (error) {
      // Log but don't fail the main job - batch progress is non-critical
      throw new Error(`Failed to update batch job progress: ${(error as Error).message}`);
    }
  }
}
