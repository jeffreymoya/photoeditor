import { Controller, Get, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { Job } from '@photoeditor/shared';
import { JobService, DownloadResponse } from './job.service';
import { DomainError, DomainErrorType } from '../../common/errors';

/**
 * Job controller handles job status and download operations
 * Stays ≤75 LOC and complexity ≤10
 * Thin glue layer - only calls one service method per endpoint
 */
@Controller('jobs')
export class JobController {
  constructor(private readonly jobService: JobService) {}

  /**
   * Gets job status by ID
   * @param jobId Job identifier from path parameter
   * @returns Job details with status
   */
  @Get(':jobId/status')
  @HttpCode(HttpStatus.OK)
  async getStatus(@Param('jobId') jobId: string): Promise<Job> {
    if (!jobId || jobId.trim() === '') {
      throw new DomainError(
        DomainErrorType.VALIDATION_ERROR,
        'Job ID required',
        { jobId }
      );
    }

    return this.jobService.getJobStatus(jobId);
  }

  /**
   * Gets download URL for completed job
   * @param jobId Job identifier from path parameter
   * @returns Presigned download URL with expiration
   */
  @Get(':jobId/download')
  @HttpCode(HttpStatus.OK)
  async getDownload(@Param('jobId') jobId: string): Promise<DownloadResponse> {
    if (!jobId || jobId.trim() === '') {
      throw new DomainError(
        DomainErrorType.VALIDATION_ERROR,
        'Job ID required',
        { jobId }
      );
    }

    return this.jobService.getDownloadUrl(jobId);
  }
}
