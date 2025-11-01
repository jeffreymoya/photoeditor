/**
 * Contract Tests for Status Handler
 *
 * Validates that status handler responses match shared schema contracts
 * per the Testing Standards and the Shared Contracts Tier standard.
 *
 * Tests:
 * - Single job status request/response validation
 * - Batch job status request/response validation
 * - Error response format compliance
 * - Schema boundary validation (Zod-at-boundaries)
 */

import { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  JobResponseSchema,
  BatchJobStatusResponseSchema,
  ErrorType
} from '@photoeditor/shared';

import {
  mockServiceInjection,
  setMockServiceOverrides,
  resetMockServiceOverrides,
  createIsolatedJobServiceMock,
} from '../support/mock-service-container';
import { ok, err } from 'neverthrow';
import { JobNotFoundError } from '../../src/repositories/job.repository';
import { parseResponseBody } from '../support/test-helpers';

jest.mock('@backend/core', () => ({
  ...jest.requireActual('@backend/core'),
  serviceInjection: mockServiceInjection,
}));

// Set required env vars before importing handler
process.env.AWS_REGION = 'us-east-1';
process.env.PROJECT_NAME = 'photoeditor';
process.env.NODE_ENV = 'test';
process.env.JOBS_TABLE_NAME = 'test-jobs-table';
process.env.BATCH_TABLE_NAME = 'test-batch-table';

// Import handler after mocks are set up
import { handler } from '../../src/lambdas/status';

// Type guard for API Gateway response
type APIGatewayResponse = Exclude<Awaited<ReturnType<typeof handler>>, string>;

const jobServiceMock = createIsolatedJobServiceMock();

describe('Status Handler Contract Tests', () => {
  beforeEach(() => {
    resetMockServiceOverrides();
    jest.useRealTimers();
    jobServiceMock.getJob.mockReset();
    jobServiceMock.getBatchJob.mockReset();
    jobServiceMock.getJobResult.mockReset();
    jobServiceMock.getBatchJobResult.mockReset();
    setMockServiceOverrides({ jobService: jobServiceMock });
  });

  afterEach(() => {
    resetMockServiceOverrides();
  });

  const createJobEvent = (jobId: string): APIGatewayProxyEventV2 => ({
    version: '2.0',
    routeKey: 'GET /v1/jobs/{id}',
    rawPath: `/v1/jobs/${jobId}`,
    rawQueryString: '',
    headers: {},
    pathParameters: { id: jobId, jobId },
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: `/v1/jobs/${jobId}`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'test-request-id',
      routeKey: 'GET /v1/jobs/{id}',
      stage: '$default',
      time: '01/Jan/2024:00:00:00 +0000',
      timeEpoch: 1704067200000,
      authorizer: {
        jwt: {
          claims: {
            sub: 'test-user-123'
          },
          scopes: []
        }
      }
    } as any,
    isBase64Encoded: false
  });

  const createBatchEvent = (batchJobId: string): APIGatewayProxyEventV2 => ({
    version: '2.0',
    routeKey: 'GET /v1/batch-status/{batchJobId}',
    rawPath: `/v1/batch-status/${batchJobId}`,
    rawQueryString: '',
    headers: {},
    pathParameters: { batchJobId },
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: `/v1/batch-status/${batchJobId}`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'test-request-id',
      routeKey: 'GET /v1/batch-status/{batchJobId}',
      stage: '$default',
      time: '01/Jan/2024:00:00:00 +0000',
      timeEpoch: 1704067200000,
      authorizer: {
        jwt: {
          claims: {
            sub: 'test-user-123'
          },
          scopes: []
        }
      }
    } as any,
    isBase64Encoded: false
  });

  describe('GET /v1/jobs/{id} - Single Job Status', () => {
    it('should return response matching JobResponseSchema for existing job', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';
      const now = new Date().toISOString();

      jobServiceMock.getJobResult.mockResolvedValue(ok({
        jobId,
        userId: 'test-user-123',
        status: 'COMPLETED',
        createdAt: now,
        updatedAt: now,
        tempS3Key: 'temp/test.jpg',
        finalS3Key: 'final/test.jpg',
        error: undefined,
      } as any));

      const event = createJobEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(200);
      expect(result.body).toBeDefined();

      // Parse and validate response against schema
      const responseBody = parseResponseBody(result.body);
      const responseValidation = JobResponseSchema.safeParse(responseBody);

      if (!responseValidation.success) {
        console.error('Schema validation errors:', responseValidation.error.errors);
      }

      expect(responseValidation.success).toBe(true);

      // Validate specific fields
      const validatedResponse = responseValidation.data!;
      expect(validatedResponse.jobId).toBe(jobId);
      expect(validatedResponse.status).toBe('COMPLETED');
      expect(validatedResponse.createdAt).toBe(now);
      expect(validatedResponse.updatedAt).toBe(now);
    });

    it('should return ApiError response for non-existent job', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';

      jobServiceMock.getJobResult.mockResolvedValue(err(new JobNotFoundError(jobId)));

      const event = createJobEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(404);
      const responseBody = parseResponseBody(result.body);
      expect(responseBody.code).toBe('JOB_NOT_FOUND');
      expect(responseBody.type).toBe(ErrorType.NOT_FOUND);
      expect(responseBody.instance).toBe('test-request-id');
      expect(responseBody.detail).toContain(jobId);
    });

    it('should return ApiError response for missing jobId parameter', async () => {
      const event = createJobEvent('');
      event.pathParameters = {};

      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = parseResponseBody(result.body);
      expect(responseBody.code).toBe('MISSING_JOB_ID');
      expect(responseBody.type).toBe(ErrorType.VALIDATION);
      expect(responseBody.instance).toBe('test-request-id');
    });
  });

  describe('GET /v1/batch-status/{batchJobId} - Batch Job Status', () => {
    it('should return response matching BatchJobStatusResponseSchema for existing batch job', async () => {
      const batchJobId = '123e4567-e89b-12d3-a456-426614174001';
      const childJobId1 = '123e4567-e89b-12d3-a456-426614174002';
      const childJobId2 = '123e4567-e89b-12d3-a456-426614174003';
      const now = new Date().toISOString();

      jobServiceMock.getBatchJobResult.mockResolvedValue(ok({
        batchJobId,
        userId: 'test-user-123',
        status: 'PROCESSING',
        createdAt: now,
        updatedAt: now,
        sharedPrompt: 'enhance all photos',
        completedCount: 1,
        totalCount: 2,
        childJobIds: [childJobId1, childJobId2],
        error: undefined,
      } as any));

      const event = createBatchEvent(batchJobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(200);
      expect(result.body).toBeDefined();

      // Parse and validate response against schema
      const responseBody = parseResponseBody(result.body);
      const responseValidation = BatchJobStatusResponseSchema.safeParse(responseBody);

      if (!responseValidation.success) {
        console.error('Schema validation errors:', responseValidation.error.errors);
      }

      expect(responseValidation.success).toBe(true);

      // Validate specific fields
      const validatedResponse = responseValidation.data!;
      expect(validatedResponse.batchJobId).toBe(batchJobId);
      expect(validatedResponse.userId).toBe('test-user-123');
      expect(validatedResponse.status).toBe('PROCESSING');
      expect(validatedResponse.sharedPrompt).toBe('enhance all photos');
      expect(validatedResponse.completedCount).toBe(1);
      expect(validatedResponse.totalCount).toBe(2);
      expect(validatedResponse.childJobIds).toHaveLength(2);
      expect(validatedResponse.childJobIds).toContain(childJobId1);
      expect(validatedResponse.childJobIds).toContain(childJobId2);
    });

    it('should return ApiError response for non-existent batch job', async () => {
      const batchJobId = '123e4567-e89b-12d3-a456-426614174001';

      jobServiceMock.getBatchJobResult.mockResolvedValue(err(new JobNotFoundError(batchJobId)));

      const event = createBatchEvent(batchJobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(404);
      const responseBody = parseResponseBody(result.body);
      expect(responseBody.code).toBe('BATCH_JOB_NOT_FOUND');
      expect(responseBody.type).toBe(ErrorType.NOT_FOUND);
      expect(responseBody.instance).toBe('test-request-id');
      expect(responseBody.detail).toContain(batchJobId);
    });

    it('should return ApiError response for missing batchJobId parameter', async () => {
      const event = createBatchEvent('');
      event.pathParameters = {};

      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = parseResponseBody(result.body);
      expect(responseBody.code).toBe('MISSING_BATCH_JOB_ID');
      expect(responseBody.type).toBe(ErrorType.VALIDATION);
      expect(responseBody.instance).toBe('test-request-id');
    });
  });

  describe('Request/Response Correlation', () => {
    it('should include x-request-id header in response', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';
      const now = new Date().toISOString();

      jobServiceMock.getJob.mockResolvedValue({
        jobId,
        userId: 'test-user-123',
        status: 'COMPLETED',
        createdAt: now,
        updatedAt: now,
        tempS3Key: 'temp/test.jpg',
        finalS3Key: 'final/test.jpg',
        error: undefined,
      } as any);

      const event = createJobEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.headers).toBeDefined();
      expect(result.headers?.['x-request-id']).toBe('test-request-id');
    });

    it('should include Content-Type header in response', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';
      const now = new Date().toISOString();

      jobServiceMock.getJob.mockResolvedValue({
        jobId,
        userId: 'test-user-123',
        status: 'COMPLETED',
        createdAt: now,
        updatedAt: now,
        tempS3Key: 'temp/test.jpg',
        finalS3Key: 'final/test.jpg',
        error: undefined,
      } as any);

      const event = createJobEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.headers).toBeDefined();
      expect(result.headers?.['Content-Type']).toBe('application/json');
    });
  });
});
