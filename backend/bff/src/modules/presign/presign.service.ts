import { Injectable } from '@nestjs/common';
import {
  PresignUploadRequest,
  PresignUploadResponse,
  BatchUploadRequest,
  BatchUploadResponse,
} from '@photoeditor/shared';
import { PresignService as CorePresignService } from '../../../../src/services/presign.service';
import { JobService } from '../../../../src/services/job.service';
import { S3Service } from '../../../../src/services/s3.service';

/**
 * NestJS service wrapper for presign operations
 * Delegates to core PresignService while maintaining DI compatibility
 * Stays ≤75 LOC
 */
@Injectable()
export class PresignService {
  private coreService: CorePresignService;

  constructor(
    jobService: JobService,
    s3Service: S3Service
  ) {
    this.coreService = new CorePresignService(jobService, s3Service);
  }

  /**
   * Generates presigned upload URL for single file
   * @param userId User identifier
   * @param request Upload request with fileName, contentType, prompt
   * @returns Presigned upload response with jobId and URL
   */
  async generatePresignedUpload(
    userId: string,
    request: PresignUploadRequest
  ): Promise<PresignUploadResponse> {
    return this.coreService.generatePresignedUpload(userId, request);
  }

  /**
   * Generates presigned upload URLs for batch upload
   * @param userId User identifier
   * @param request Batch upload request with files array
   * @returns Batch upload response with batchJobId and presigned URLs
   */
  async generateBatchPresignedUpload(
    userId: string,
    request: BatchUploadRequest
  ): Promise<BatchUploadResponse> {
    return this.coreService.generateBatchPresignedUpload(userId, request);
  }
}
