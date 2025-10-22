// @ts-nocheck
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import {
  PresignUploadRequestSchema,
  BatchUploadRequestSchema,
  PresignUploadResponse,
  BatchUploadResponse,
} from '@photoeditor/shared';
import { PresignService } from './presign.service';
import { DomainError, DomainErrorType } from '../../common/errors';

/**
 * Presign controller handles presigned URL generation
 * Stays ≤75 LOC and complexity ≤10 per STANDARDS.md line 36
 * Thin glue layer - only calls one service method per endpoint per STANDARDS.md line 54
 */
@Controller('presign')
export class PresignController {
  constructor(private readonly presignService: PresignService) {}

  /**
   * Generates presigned upload URL(s)
   * Handles both single and batch uploads based on request shape
   * @param body Request body (single or batch upload)
   * @returns Presigned upload response
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async createPresignedUpload(
    @Body() body: unknown
  ): Promise<PresignUploadResponse | BatchUploadResponse> {
    // Extract userId from request context (set by auth middleware)
    const userId = 'anonymous'; // TODO: Extract from JWT in production

    // Validate and route based on request shape
    if (this.isBatchRequest(body)) {
      return this.handleBatchUpload(userId, body);
    }

    return this.handleSingleUpload(userId, body);
  }

  /**
   * Handles single file upload presign request
   */
  private async handleSingleUpload(
    userId: string,
    body: unknown
  ): Promise<PresignUploadResponse> {
    const parseResult = PresignUploadRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new DomainError(
        DomainErrorType.VALIDATION_ERROR,
        'Invalid upload request',
        { errors: parseResult.error.errors }
      );
    }

    return this.presignService.generatePresignedUpload(userId, parseResult.data);
  }

  /**
   * Handles batch file upload presign request
   */
  private async handleBatchUpload(
    userId: string,
    body: unknown
  ): Promise<BatchUploadResponse> {
    const parseResult = BatchUploadRequestSchema.safeParse(body);
    if (!parseResult.success) {
      throw new DomainError(
        DomainErrorType.VALIDATION_ERROR,
        'Invalid batch upload request',
        { errors: parseResult.error.errors }
      );
    }

    return this.presignService.generateBatchPresignedUpload(userId, parseResult.data);
  }

  /**
   * Type guard to check if request is batch upload
   */
  private isBatchRequest(body: unknown): boolean {
    return typeof body === 'object' && body !== null && 'files' in body && Array.isArray((body as Record<string, unknown>).files);
  }
}
