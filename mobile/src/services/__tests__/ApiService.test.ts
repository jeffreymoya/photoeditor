/**
 * ApiService Unit Tests
 *
 * Tests validate that ApiService correctly uses shared contract schemas
 * to parse and validate API request/response data. This ensures mobile
 * client stays aligned with backend contracts (SSOT from @photoeditor/shared).
 *
 * References:
 * - standards/shared-contracts-tier.md: Contract-first API design
 * - standards/frontend-tier.md: Services layer validation requirements
 * - docs/testing-standards.md: Mobile services testing guidelines
 */

import { apiService } from '../ApiService';
import {
  PresignUploadRequestSchema,
  PresignUploadResponseSchema,
  BatchUploadRequestSchema,
  BatchUploadResponseSchema,
  JobSchema,
  BatchJobSchema,
  DeviceTokenRegistrationSchema,
  DeviceTokenResponseSchema,
} from '@photoeditor/shared';

// Mock global fetch
global.fetch = jest.fn();

describe('ApiService - Shared Schema Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('Schema Validation - Request Presigned URL', () => {
    it('should validate request body using PresignUploadRequestSchema', async () => {
      const mockResponse = {
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        presignedUrl: 'https://s3.example.com/upload',
        s3Key: 'uploads/test.jpg',
        expiresAt: '2025-10-06T12:00:00.000Z',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await apiService.requestPresignedUrl(
        'test.jpg',
        'image/jpeg',
        1024000,
        'test prompt'
      );

      // Verify request body was validated against schema
      const requestCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(requestCall[1].body);

      expect(() => PresignUploadRequestSchema.parse(requestBody)).not.toThrow();
      expect(requestBody).toEqual({
        fileName: 'test.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024000,
        prompt: 'test prompt',
      });

      // Verify response was validated against schema
      expect(() => PresignUploadResponseSchema.parse(result)).not.toThrow();
      expect(result).toEqual(mockResponse);
    });

    it('should reject invalid request data that violates schema', async () => {
      // Attempt to create invalid request (negative file size)
      await expect(async () => {
        PresignUploadRequestSchema.parse({
          fileName: 'test.jpg',
          contentType: 'image/jpeg',
          fileSize: -1000, // Invalid: negative size
        });
      }).rejects.toThrow();
    });

    it('should reject invalid response data that violates schema', async () => {
      const invalidResponse = {
        jobId: 'not-a-uuid', // Invalid: must be UUID
        presignedUrl: 'not-a-url', // Invalid: must be valid URL
        s3Key: 'test.jpg',
        expiresAt: 'not-a-datetime', // Invalid: must be ISO datetime
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => invalidResponse,
      });

      await expect(
        apiService.requestPresignedUrl('test.jpg', 'image/jpeg', 1024000)
      ).rejects.toThrow();
    });
  });

  describe('Schema Validation - Job Status', () => {
    it('should validate job status response using JobSchema', async () => {
      const mockJobStatus = {
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        userId: 'user123',
        status: 'COMPLETED' as const,
        createdAt: '2025-10-06T10:00:00.000Z',
        updatedAt: '2025-10-06T10:05:00.000Z',
        finalS3Key: 'processed/test.jpg',
        locale: 'en',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockJobStatus,
      });

      const result = await apiService.getJobStatus('123e4567-e89b-12d3-a456-426614174000');

      expect(() => JobSchema.parse(result)).not.toThrow();
      expect(result.status).toBe('COMPLETED');
      expect(result.finalS3Key).toBe('processed/test.jpg');
    });

    it('should validate all possible job statuses', () => {
      const statuses = ['QUEUED', 'PROCESSING', 'EDITING', 'COMPLETED', 'FAILED'];

      statuses.forEach(status => {
        const job = {
          jobId: '123e4567-e89b-12d3-a456-426614174000',
          userId: 'user123',
          status,
          createdAt: '2025-10-06T10:00:00.000Z',
          updatedAt: '2025-10-06T10:00:00.000Z',
          locale: 'en',
        };

        expect(() => JobSchema.parse(job)).not.toThrow();
      });
    });

    it('should reject invalid job status', () => {
      const invalidJob = {
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        userId: 'user123',
        status: 'INVALID_STATUS', // Not in enum
        createdAt: '2025-10-06T10:00:00.000Z',
        updatedAt: '2025-10-06T10:00:00.000Z',
        locale: 'en',
      };

      expect(() => JobSchema.parse(invalidJob)).toThrow();
    });
  });

  describe('Schema Validation - Batch Upload', () => {
    it('should validate batch upload request using BatchUploadRequestSchema', async () => {
      const mockResponse = {
        batchJobId: '123e4567-e89b-12d3-a456-426614174000',
        uploads: [
          {
            presignedUrl: 'https://s3.example.com/upload1',
            s3Key: 'uploads/test1.jpg',
            expiresAt: '2025-10-06T12:00:00.000Z',
          },
          {
            presignedUrl: 'https://s3.example.com/upload2',
            s3Key: 'uploads/test2.jpg',
            expiresAt: '2025-10-06T12:00:00.000Z',
          },
        ],
        childJobIds: [
          '223e4567-e89b-12d3-a456-426614174000',
          '323e4567-e89b-12d3-a456-426614174000',
        ],
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const files = [
        { fileName: 'test1.jpg', fileSize: 1024000 },
        { fileName: 'test2.jpg', fileSize: 2048000 },
      ];

      const result = await apiService.requestBatchPresignedUrls(
        files,
        'shared prompt',
        ['prompt1', 'prompt2']
      );

      // Verify request body was validated
      const requestCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(requestCall[1].body);

      expect(() => BatchUploadRequestSchema.parse(requestBody)).not.toThrow();
      expect(requestBody.files).toHaveLength(2);
      expect(requestBody.sharedPrompt).toBe('shared prompt');

      // Verify response was validated
      expect(() => BatchUploadResponseSchema.parse(result)).not.toThrow();
      expect(result.uploads).toHaveLength(2);
      expect(result.childJobIds).toHaveLength(2);
    });

    it('should reject batch request with too many files', () => {
      const files = Array(11).fill({
        fileName: 'test.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024000,
      });

      expect(() =>
        BatchUploadRequestSchema.parse({
          files,
          sharedPrompt: 'test',
        })
      ).toThrow(); // Max 10 files per batch
    });

    it('should reject batch request with empty files array', () => {
      expect(() =>
        BatchUploadRequestSchema.parse({
          files: [],
          sharedPrompt: 'test',
        })
      ).toThrow(); // Min 1 file required
    });
  });

  describe('Schema Validation - Batch Job Status', () => {
    it('should validate batch job status using BatchJobSchema', async () => {
      const mockBatchStatus = {
        batchJobId: '123e4567-e89b-12d3-a456-426614174000',
        userId: 'user123',
        status: 'PROCESSING' as const,
        createdAt: '2025-10-06T10:00:00.000Z',
        updatedAt: '2025-10-06T10:05:00.000Z',
        sharedPrompt: 'test prompt',
        childJobIds: [
          '223e4567-e89b-12d3-a456-426614174000',
          '323e4567-e89b-12d3-a456-426614174000',
        ],
        completedCount: 1,
        totalCount: 2,
        locale: 'en',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockBatchStatus,
      });

      const result = await apiService.getBatchJobStatus('123e4567-e89b-12d3-a456-426614174000');

      expect(() => BatchJobSchema.parse(result)).not.toThrow();
      expect(result.completedCount).toBe(1);
      expect(result.totalCount).toBe(2);
      expect(result.childJobIds).toHaveLength(2);
    });
  });

  describe('Schema Validation - Device Token Registration', () => {
    it('should validate device token request using DeviceTokenRegistrationSchema', async () => {
      const mockResponse = {
        success: true,
        message: 'Device token registered successfully',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await apiService.registerDeviceToken(
        'ExponentPushToken[xxxxx]',
        'ios',
        'device-123'
      );

      // Verify request body was validated
      const requestCall = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(requestCall[1].body);

      expect(() => DeviceTokenRegistrationSchema.parse(requestBody)).not.toThrow();
      expect(requestBody.expoPushToken).toBe('ExponentPushToken[xxxxx]');
      expect(requestBody.platform).toBe('ios');
      expect(requestBody.deviceId).toBe('device-123');

      // Verify response was validated
      expect(() => DeviceTokenResponseSchema.parse(result)).not.toThrow();
      expect(result.success).toBe(true);
    });

    it('should reject invalid platform values', () => {
      expect(() =>
        DeviceTokenRegistrationSchema.parse({
          expoPushToken: 'token',
          platform: 'windows', // Invalid: must be ios or android
          deviceId: 'device-123',
        })
      ).toThrow();
    });

    it('should validate device token deactivation response', async () => {
      const mockResponse = {
        success: true,
        message: 'Device token deactivated successfully',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await apiService.deactivateDeviceToken('device-123');

      expect(() => DeviceTokenResponseSchema.parse(result)).not.toThrow();
      expect(result.success).toBe(true);
    });
  });

  describe('Contract Drift Prevention', () => {
    it('should use shared schemas directly without local copies', () => {
      // This test verifies that ApiService imports schemas from @photoeditor/shared
      // rather than defining them locally, preventing contract drift

      const apiServiceCode = require('fs').readFileSync(
        require.resolve('../ApiService'),
        'utf8'
      );

      // Verify imports from shared package
      expect(apiServiceCode).toContain("from '@photoeditor/shared'");

      // Verify no local schema definitions (these would indicate drift risk)
      expect(apiServiceCode).not.toContain('const PresignRequestSchema = z.object');
      expect(apiServiceCode).not.toContain('const PresignResponseSchema = z.object');
      expect(apiServiceCode).not.toContain('const JobStatusSchema = z.object');
      expect(apiServiceCode).not.toContain('const FileUploadSchema = z.object');
      expect(apiServiceCode).not.toContain('const BatchUploadRequestSchema = z.object');
      expect(apiServiceCode).not.toContain('const BatchJobStatusSchema = z.object');
      expect(apiServiceCode).not.toContain('const DeviceTokenRegistrationSchema = z.object');
    });

    it('should not re-export shared schemas from mobile modules', () => {
      // Per task constraint: "Do not re-export shared schemas from mobile-specific modules"
      const apiServiceCode = require('fs').readFileSync(
        require.resolve('../ApiService'),
        'utf8'
      );

      // Verify no re-exports
      expect(apiServiceCode).not.toContain('export { PresignUploadRequestSchema');
      expect(apiServiceCode).not.toContain('export { JobSchema');
      expect(apiServiceCode).not.toContain('export { BatchUploadRequestSchema');
    });
  });

  describe('API Error Handling', () => {
    it('should throw error on non-ok HTTP response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      await expect(
        apiService.requestPresignedUrl('test.jpg', 'image/jpeg', 1024000)
      ).rejects.toThrow('API Error: 400 Bad Request');
    });

    it('should throw error on network failure', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await expect(
        apiService.requestPresignedUrl('test.jpg', 'image/jpeg', 1024000)
      ).rejects.toThrow('Network error');
    });

    it('should throw error on schema validation failure', async () => {
      const invalidResponse = {
        jobId: 'not-a-uuid',
        presignedUrl: 'not-a-url',
        s3Key: 'test.jpg',
        expiresAt: 'invalid-date',
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => invalidResponse,
      });

      await expect(
        apiService.requestPresignedUrl('test.jpg', 'image/jpeg', 1024000)
      ).rejects.toThrow(); // Zod validation error
    });
  });
});
