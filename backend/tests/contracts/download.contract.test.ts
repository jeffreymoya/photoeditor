/**
 * Contract Tests for Download Handler
 *
 * Validates that download handler responses match shared schema contracts
 * per the Testing Standards and the Shared Contracts Tier standard.
 *
 * Tests:
 * - Download URL generation for completed jobs
 * - Error responses for invalid states
 * - Schema boundary validation (Zod-at-boundaries)
 */

import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';

import {
  mockServiceInjection,
  setMockServiceOverrides,
  resetMockServiceOverrides,
  createIsolatedJobServiceMock,
  createIsolatedS3ServiceMock,
} from '../support/mock-service-container';
import { parseResponseBody } from '../support/test-helpers';

jest.mock('@backend/core', () => ({
  ...jest.requireActual('@backend/core'),
  serviceInjection: mockServiceInjection,
}));

// Set required env vars before importing handler
process.env.AWS_REGION = 'us-east-1';
process.env.PROJECT_NAME = 'photoeditor';
process.env.NODE_ENV = 'test';
process.env.TEMP_BUCKET_NAME = 'test-temp-bucket';
process.env.FINAL_BUCKET_NAME = 'test-final-bucket';
process.env.JOBS_TABLE_NAME = 'test-jobs-table';

// Import handler after mocks are set up
import { handler } from '../../src/lambdas/download';

// Type guard for API Gateway response
type APIGatewayResponse = Exclude<Awaited<ReturnType<typeof handler>>, string>;

// Download response schema from routes.manifest.ts
const DownloadResponseSchema = z.object({
  downloadUrl: z.string().url(),
  expiresAt: z.string().datetime(),
  jobId: z.string().uuid(),
  status: z.string(),
});

const jobServiceMock = createIsolatedJobServiceMock();
const s3ServiceMock = createIsolatedS3ServiceMock();

describe('Download Handler Contract Tests', () => {
  beforeEach(() => {
    resetMockServiceOverrides();
    jest.useRealTimers();
    jobServiceMock.getJob.mockReset();
    s3ServiceMock.generatePresignedDownload.mockReset();
    s3ServiceMock.getFinalBucket.mockReset();
    setMockServiceOverrides({
      jobService: jobServiceMock,
      s3Service: s3ServiceMock,
    });
  });

  afterEach(() => {
    resetMockServiceOverrides();
  });

  const createEvent = (jobId: string): APIGatewayProxyEventV2 => ({
    version: '2.0',
    routeKey: 'GET /v1/jobs/{id}/download',
    rawPath: `/v1/jobs/${jobId}/download`,
    rawQueryString: '',
    headers: {},
    pathParameters: { jobId },
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: `/v1/jobs/${jobId}/download`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test',
      },
      requestId: 'test-request-id',
      routeKey: 'GET /v1/jobs/{id}/download',
      stage: '$default',
      time: '01/Jan/2024:00:00:00 +0000',
      timeEpoch: 1704067200000,
      authorizer: {
        jwt: {
          claims: {
            sub: 'test-user-123',
          },
          scopes: [],
        },
      },
    } as any,
    isBase64Encoded: false,
  });

  describe('GET /v1/jobs/{id}/download - Generate Download URL', () => {
    it('should return response matching DownloadResponseSchema for completed job', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';
      const now = new Date().toISOString();
      const downloadUrl = 'https://mock-download-url.s3.amazonaws.com/final/test-edited.jpg';

      jobServiceMock.getJob.mockResolvedValue({
        jobId,
        userId: 'test-user-123',
        status: 'COMPLETED',
        createdAt: now,
        updatedAt: now,
        finalS3Key: 'final/test-edited.jpg',
      } as any);
      s3ServiceMock.getFinalBucket.mockReturnValue('test-final-bucket');
      s3ServiceMock.generatePresignedDownload.mockResolvedValue(downloadUrl);

      const event = createEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(200);
      expect(result.body).toBeDefined();

      const responseBody = parseResponseBody(result.body);
      const responseValidation = DownloadResponseSchema.safeParse(responseBody);
      expect(responseValidation.success).toBe(true);

      if (responseValidation.success) {
        expect(responseValidation.data.jobId).toBe(jobId);
        expect(responseValidation.data.status).toBe('COMPLETED');
        expect(responseValidation.data.downloadUrl).toBe(downloadUrl);
        expect(new Date(responseValidation.data.expiresAt).getTime()).toBeGreaterThan(Date.now());
      }
    });

    it('should return 400 for job not in COMPLETED status', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';
      const now = new Date().toISOString();

      jobServiceMock.getJob.mockResolvedValue({
        jobId,
        userId: 'test-user-123',
        status: 'PROCESSING',
        createdAt: now,
        updatedAt: now,
        tempS3Key: 'temp/test.jpg',
      } as any);

      const event = createEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = parseResponseBody(result.body);
      expect(responseBody.error).toContain('not completed');
    });

    it('should return 404 for non-existent job', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';

      jobServiceMock.getJob.mockResolvedValue(null);

      const event = createEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(404);
      const responseBody = parseResponseBody(result.body);
      expect(responseBody.error).toBe('Job not found');
    });

    it('should return 400 for missing jobId parameter', async () => {
      const event = createEvent('');
      event.pathParameters = {};

      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = parseResponseBody(result.body);
      expect(responseBody.error).toBe('Job ID required');
    });

    it('should return 500 for job with missing finalS3Key', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';
      const now = new Date().toISOString();

      jobServiceMock.getJob.mockResolvedValue({
        jobId,
        userId: 'test-user-123',
        status: 'COMPLETED',
        createdAt: now,
        updatedAt: now,
        finalS3Key: undefined,
      } as any);

      const event = createEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(500);
      const responseBody = parseResponseBody(result.body);
      expect(responseBody.error).toBe('Download not available');
    });
  });

  describe('Response Headers', () => {
    it('should include Content-Type header in response', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';
      const now = new Date().toISOString();

      jobServiceMock.getJob.mockResolvedValue({
        jobId,
        userId: 'test-user-123',
        status: 'COMPLETED',
        createdAt: now,
        updatedAt: now,
        finalS3Key: 'final/test.jpg',
      } as any);
      s3ServiceMock.getFinalBucket.mockReturnValue('test-final-bucket');
      s3ServiceMock.generatePresignedDownload.mockResolvedValue('https://mock-download-url.s3.amazonaws.com/final/test.jpg');

      const event = createEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.headers?.['Content-Type']).toBe('application/json');
    });
  });
});
