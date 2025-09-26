import { JobService } from './job.service';
import { S3Service } from './s3.service';
import { CreateJobRequest, PresignUploadRequest, PresignUploadResponse } from '@photoeditor/shared';

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
}