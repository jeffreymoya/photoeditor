/**
 * Contract Tests for Download Handler
 *
 * Validates that download handler responses match shared schema contracts
 * per standards/testing-standards.md and standards/shared-contracts-tier.md.
 *
 * Tests:
 * - Download URL generation for completed jobs
 * - Error responses for invalid states
 * - Schema boundary validation (Zod-at-boundaries)
 */

import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { z } from 'zod';

// Mock presigner for download URLs
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-download-url.s3.amazonaws.com/final/test.jpg?X-Amz-Signature=mock')
}));

// Mock PowerTools
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
jest.mock('@aws-lambda-powertools/logger', () => ({
  Logger: jest.fn(() => mockLogger)
}));
jest.mock('@aws-lambda-powertools/metrics');
jest.mock('@aws-lambda-powertools/tracer');

// Set required env vars before importing handler
process.env.AWS_REGION = 'us-east-1';
process.env.PROJECT_NAME = 'photoeditor';
process.env.NODE_ENV = 'test';
process.env.TEMP_BUCKET_NAME = 'test-temp-bucket';
process.env.FINAL_BUCKET_NAME = 'test-final-bucket';
process.env.JOBS_TABLE_NAME = 'test-jobs-table';

const dynamoMock = mockClient(DynamoDBClient);
const s3Mock = mockClient(S3Client);
const mockDynamoInstance = new DynamoDBClient({});
const mockS3Instance = new S3Client({});

jest.mock('@backend/core', () => ({
  createDynamoDBClient: jest.fn().mockReturnValue(mockDynamoInstance),
  createS3Client: jest.fn().mockReturnValue(mockS3Instance),
  ConfigService: jest.fn().mockImplementation(() => ({})),
  serviceInjection: jest.fn().mockReturnValue({
    before: jest.fn(),
    after: jest.fn()
  })
}), { virtual: true });

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

describe('Download Handler Contract Tests', () => {
  beforeEach(() => {
    dynamoMock.reset();
    s3Mock.reset();
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    jest.useRealTimers();
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
        userAgent: 'test'
      },
      requestId: 'test-request-id',
      routeKey: 'GET /v1/jobs/{id}/download',
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

  describe('GET /v1/jobs/{id}/download - Generate Download URL', () => {
    it('should return response matching DownloadResponseSchema for completed job', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';
      const now = new Date().toISOString();

      // Mock DynamoDB response for completed job
      dynamoMock.on(GetItemCommand).resolves({
        Item: {
          PK: { S: `JOB#${jobId}` },
          SK: { S: `JOB#${jobId}` },
          jobId: { S: jobId },
          userId: { S: 'test-user-123' },
          status: { S: 'COMPLETED' },
          createdAt: { S: now },
          updatedAt: { S: now },
          finalS3Key: { S: 'final/test-edited.jpg' }
        }
      });

      const event = createEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(200);
      expect(result.body).toBeDefined();

      // Parse and validate response against schema
      const responseBody = JSON.parse(result.body as string);
      const responseValidation = DownloadResponseSchema.safeParse(responseBody);

      if (!responseValidation.success) {
        console.error('Schema validation errors:', responseValidation.error.errors);
      }

      expect(responseValidation.success).toBe(true);

      // Validate specific fields
      const validatedResponse = responseValidation.data!;
      expect(validatedResponse.jobId).toBe(jobId);
      expect(validatedResponse.status).toBe('COMPLETED');
      expect(validatedResponse.downloadUrl).toContain('https://');
      expect(validatedResponse.downloadUrl).toContain('.s3.amazonaws.com');
      expect(new Date(validatedResponse.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('should return 400 for job not in COMPLETED status', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';
      const now = new Date().toISOString();

      // Mock DynamoDB response for processing job
      dynamoMock.on(GetItemCommand).resolves({
        Item: {
          PK: { S: `JOB#${jobId}` },
          SK: { S: `JOB#${jobId}` },
          jobId: { S: jobId },
          userId: { S: 'test-user-123' },
          status: { S: 'PROCESSING' },
          createdAt: { S: now },
          updatedAt: { S: now },
          tempS3Key: { S: 'temp/test.jpg' }
        }
      });

      const event = createEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string);
      expect(responseBody.error).toContain('not completed');
    });

    it('should return 404 for non-existent job', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';

      // Mock DynamoDB returning no item
      dynamoMock.on(GetItemCommand).resolves({});

      const event = createEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(404);
      const responseBody = JSON.parse(result.body as string);
      expect(responseBody.error).toBe('Job not found');
    });

    it('should return 400 for missing jobId parameter', async () => {
      const event = createEvent('');
      event.pathParameters = {};

      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string);
      expect(responseBody.error).toBe('Job ID required');
    });

    it('should return 500 for job with missing finalS3Key', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';
      const now = new Date().toISOString();

      // Mock DynamoDB response for completed job without finalS3Key
      dynamoMock.on(GetItemCommand).resolves({
        Item: {
          PK: { S: `JOB#${jobId}` },
          SK: { S: `JOB#${jobId}` },
          jobId: { S: jobId },
          userId: { S: 'test-user-123' },
          status: { S: 'COMPLETED' },
          createdAt: { S: now },
          updatedAt: { S: now }
          // Missing finalS3Key
        }
      });

      const event = createEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(500);
      const responseBody = JSON.parse(result.body as string);
      expect(responseBody.error).toBe('Download not available');
    });
  });

  describe('Response Headers', () => {
    it('should include Content-Type header in response', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';
      const now = new Date().toISOString();

      dynamoMock.on(GetItemCommand).resolves({
        Item: {
          PK: { S: `JOB#${jobId}` },
          SK: { S: `JOB#${jobId}` },
          jobId: { S: jobId },
          userId: { S: 'test-user-123' },
          status: { S: 'COMPLETED' },
          createdAt: { S: now },
          updatedAt: { S: now },
          finalS3Key: { S: 'final/test-edited.jpg' }
        }
      });

      const event = createEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.headers).toBeDefined();
      expect(result.headers?.['Content-Type']).toBe('application/json');
    });
  });

  describe('Download URL Expiration', () => {
    it('should generate download URL with future expiration time', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';
      const now = new Date().toISOString();

      dynamoMock.on(GetItemCommand).resolves({
        Item: {
          PK: { S: `JOB#${jobId}` },
          SK: { S: `JOB#${jobId}` },
          jobId: { S: jobId },
          userId: { S: 'test-user-123' },
          status: { S: 'COMPLETED' },
          createdAt: { S: now },
          updatedAt: { S: now },
          finalS3Key: { S: 'final/test-edited.jpg' }
        }
      });

      const event = createEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      const responseBody = JSON.parse(result.body as string);
      const expiresAt = new Date(responseBody.expiresAt);
      const futureTime = new Date(Date.now() + 3600 * 1000); // 1 hour from now

      // Expiration should be roughly 1 hour in the future (with some tolerance)
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(expiresAt.getTime()).toBeLessThanOrEqual(futureTime.getTime() + 5000); // 5 second tolerance
    });
  });
});
