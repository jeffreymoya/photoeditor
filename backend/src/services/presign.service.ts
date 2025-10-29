import {
  CreateJobRequest,
  PresignUploadRequest,
  PresignUploadResponse,
  BatchUploadRequest,
  BatchUploadResponse,
  CreateBatchJobRequest
} from '@photoeditor/shared';

import { JobService } from './job.service';
import { S3Service } from './s3.service';

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
    // Create job first
    const createJobRequest: CreateJobRequest = {
      userId,
      locale: 'en',
      settings: {},
      prompt: request.prompt
    };

    const job = await this.jobService.createJob(createJobRequest);

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
    // Create batch job first
    const createBatchJobRequest: CreateBatchJobRequest = {
      userId,
      sharedPrompt: request.sharedPrompt,
      individualPrompts: request.individualPrompts,
      fileCount: request.files.length,
      locale: 'en',
      settings: {}
    };

    const batchJob = await this.jobService.createBatchJob(createBatchJobRequest);

    // Create individual child jobs for each file
    const childJobs = await Promise.all(
      request.files.map(async (_, index) => {
        const prompt = request.individualPrompts?.[index] || request.sharedPrompt;
        const createJobRequest: CreateJobRequest = {
          userId,
          locale: 'en',
          settings: {},
          prompt,
          batchJobId: batchJob.batchJobId
        };
        return await this.jobService.createJob(createJobRequest);
      })
    );

    // Update batch job with child job IDs
    await this.jobService.updateBatchJobStatus(batchJob.batchJobId, batchJob.status, {
      childJobIds: childJobs.map(job => job.jobId)
    });

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