import { Injectable } from '@nestjs/common';
import { Job } from '@photoeditor/shared';
import { JobService as CoreJobService } from '../../../../src/services/job.service';
import { S3Service } from '../../../../src/services/s3.service';
import { DomainError, DomainErrorType, mapJobStatusToError } from '../../common/errors';

/**
 * Download response with presigned URL and metadata
 */
export interface DownloadResponse {
  downloadUrl: string;
  expiresAt: string;
  jobId: string;
  status: string;
}

/**
 * NestJS service wrapper for job operations
 * Delegates to core JobService while maintaining DI compatibility
 * Stays ≤200 LOC
 */
@Injectable()
export class JobService {
  constructor(
    private readonly coreJobService: CoreJobService,
    private readonly s3Service: S3Service
  ) {}

  /**
   * Gets job status by ID
   * @param jobId Job identifier
   * @returns Job details or null if not found
   */
  async getJobStatus(jobId: string): Promise<Job> {
    const job = await this.coreJobService.getJob(jobId);

    if (!job) {
      throw new DomainError(
        DomainErrorType.RESOURCE_NOT_FOUND,
        'Job not found',
        { jobId }
      );
    }

    return job;
  }

  /**
   * Generates download URL for completed job
   * @param jobId Job identifier
   * @returns Download response with presigned URL
   */
  async getDownloadUrl(jobId: string): Promise<DownloadResponse> {
    const job = await this.coreJobService.getJob(jobId);

    if (!job) {
      throw new DomainError(
        DomainErrorType.RESOURCE_NOT_FOUND,
        'Job not found',
        { jobId }
      );
    }

    if (job.status !== 'COMPLETED') {
      throw new DomainError(
        mapJobStatusToError(job.status),
        `Job is not completed. Current status: ${job.status}`,
        { jobId, status: job.status }
      );
    }

    if (!job.finalS3Key) {
      throw new DomainError(
        DomainErrorType.INTERNAL_ERROR,
        'Download not available - final S3 key missing',
        { jobId }
      );
    }

    const downloadUrl = await this.s3Service.generatePresignedDownload(
      this.s3Service.getFinalBucket(),
      job.finalS3Key,
      3600
    );

    return {
      downloadUrl,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      jobId: job.jobId,
      status: job.status,
    };
  }
}
