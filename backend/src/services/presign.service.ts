import {
  CreateJobRequest,
  PresignUploadRequest,
  PresignUploadResponse,
  BatchUploadRequest,
  BatchUploadResponse,
  CreateBatchJobRequest
} from '@photoeditor/shared';

import { JobService, JobServiceError } from './job.service';
import { S3Service } from './s3.service';

/**
 * PresignService errors - typed error union for Result flows
 */
export type PresignServiceError = JobServiceError | { type: 'S3Error'; message: string };

/**
 * PresignService - Orchestrates job creation and presigned URL generation
 *
 * Refactored per standards/backend-tier.md#domain-service-layer:
 * - Uses Result/ResultAsync for all operations
 * - No thrown exceptions for control flow
 * - Calls Result-based JobService APIs
 */
export class PresignService {
  private jobService: JobService;
  private s3Service: S3Service;

  constructor(jobService: JobService, s3Service: S3Service) {
    this.jobService = jobService;
    this.s3Service = s3Service;
  }

  async generatePresignedUpload(
    userId: string,
    request: PresignUploadRequest
  ): Promise<PresignUploadResponse> {
    // Create job first - using Result-based API
    const createJobRequest: CreateJobRequest = {
      userId,
      locale: 'en',
      settings: {},
      prompt: request.prompt
    };

    const jobResult = await this.jobService.createJobResult(createJobRequest);
    if (jobResult.isErr()) {
      throw jobResult.error;
    }
    const job = jobResult.value;

    // Generate presigned URL
    const presignedUpload = await this.s3Service.generatePresignedUpload(
      userId,
      job.jobId,
      request.fileName,
      request.contentType
    );

    return {
      jobId: job.jobId,
      presignedUrl: presignedUpload.url,
      s3Key: presignedUpload.fields.key,
      expiresAt: presignedUpload.expiresAt.toISOString()
    };
  }

  async generateBatchPresignedUpload(
    userId: string,
    request: BatchUploadRequest
  ): Promise<BatchUploadResponse> {
    // Create batch job first - using Result-based API
    const createBatchJobRequest: CreateBatchJobRequest = {
      userId,
      sharedPrompt: request.sharedPrompt,
      individualPrompts: request.individualPrompts,
      fileCount: request.files.length,
      locale: 'en',
      settings: {}
    };

    const batchJobResult = await this.jobService.createBatchJobResult(createBatchJobRequest);
    if (batchJobResult.isErr()) {
      throw batchJobResult.error;
    }
    const batchJob = batchJobResult.value;

    // Create individual child jobs for each file - using Result-based API
    const childJobResults = await Promise.all(
      request.files.map(async (_, index) => {
        const prompt = request.individualPrompts?.[index] || request.sharedPrompt;
        const createJobRequest: CreateJobRequest = {
          userId,
          locale: 'en',
          settings: {},
          prompt,
          batchJobId: batchJob.batchJobId
        };
        return await this.jobService.createJobResult(createJobRequest);
      })
    );

    // Check for failures in child job creation
    const failedResult = childJobResults.find(r => r.isErr());
    if (failedResult?.isErr()) {
      throw failedResult.error;
    }

    const childJobs = childJobResults.map(r => r._unsafeUnwrap());

    // Update batch job with child job IDs - using Result-based API
    const updateResult = await this.jobService.updateBatchJobStatusResult(batchJob.batchJobId, batchJob.status, {
      childJobIds: childJobs.map(job => job.jobId)
    });
    if (updateResult.isErr()) {
      throw updateResult.error;
    }

    // Generate presigned URLs for all files
    const uploads = await Promise.all(
      request.files.map(async (file, index) => {
        const childJob = childJobs[index];
        const presignedUpload = await this.s3Service.generatePresignedUpload(
          userId,
          childJob.jobId,
          file.fileName,
          file.contentType
        );

        return {
          presignedUrl: presignedUpload.url,
          s3Key: presignedUpload.fields.key,
          expiresAt: presignedUpload.expiresAt.toISOString()
        };
      })
    );

    return {
      batchJobId: batchJob.batchJobId,
      uploads,
      childJobIds: childJobs.map(job => job.jobId)
    };
  }
}