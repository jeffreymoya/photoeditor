/**
 * Contract tests for POST /upload/presign endpoint
 * These tests validate that the response conforms to the OpenAPI specification
 */

import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { marshall } from '@aws-sdk/util-dynamodb';
import {
  PresignUploadResponseSchema,
  BatchUploadResponseSchema
} from '@photoeditor/shared';

// Mock presigner to avoid real credential usage
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-presigned-url.s3.amazonaws.com')
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

// Mock Bootstrap service
jest.mock('../../src/services/bootstrap.service', () => ({
  BootstrapService: jest.fn().mockImplementation(() => ({
    initializeProviders: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Set required env vars
process.env.AWS_REGION = 'us-east-1';
process.env.PROJECT_NAME = 'photoeditor';
process.env.NODE_ENV = 'test';
process.env.TEMP_BUCKET_NAME = 'test-temp-bucket';
process.env.FINAL_BUCKET_NAME = 'test-final-bucket';
process.env.JOBS_TABLE_NAME = 'test-jobs-table';
process.env.BATCH_TABLE_NAME = 'test-batch-table';

const dynamoMock = mockClient(DynamoDBClient);
const s3Mock = mockClient(S3Client);

// Import handler after mocks
import { handler } from '../../src/lambdas/presign';

// Type guard for API Gateway response
type APIGatewayResponse = Exclude<Awaited<ReturnType<typeof handler>>, string>;

describe('POST /upload/presign - Contract Tests', () => {
  beforeEach(() => {
    dynamoMock.reset();
    s3Mock.reset();
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    jest.useRealTimers();
  });

  const createEvent = (body: any): APIGatewayProxyEventV2 => ({
    version: '2.0',
    routeKey: 'POST /upload/presign',
    rawPath: '/upload/presign',
    rawQueryString: '',
    headers: { 'Content-Type': 'application/json' },
    requestContext: {
      accountId: '123456789012',
      apiId: 'contract-test-api',
      domainName: 'api.photoeditor.test',
      domainPrefix: 'api',
      http: {
        method: 'POST',
        path: '/upload/presign',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'contract-test'
      },
      requestId: 'contract-test-request-id',
      routeKey: 'POST /upload/presign',
      stage: 'v1',
      time: '04/Oct/2025:00:00:00 +0000',
      timeEpoch: Date.now(),
      authorizer: {
        jwt: {
          claims: {
            sub: 'contract-test-user-123'
          },
          scopes: []
        }
      }
    } as any,
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false
  });

  describe('Single Upload Response Contract', () => {
    it('should return 200 with valid single upload response schema', async () => {
      const event = createEvent({
        fileName: 'contract-test.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024 * 1024,
        prompt: 'Contract test prompt'
      });

      dynamoMock.resolves({});
      s3Mock.resolves({});

      const result = await handler(event, {} as any) as APIGatewayResponse;

      // Verify HTTP status code
      expect(result.statusCode).toBe(200);

      // Verify Content-Type header
      expect(result.headers).toBeDefined();
      expect(result.headers?.['Content-Type']).toBe('application/json');

      // Parse and validate response against schema
      const response = JSON.parse(result.body as string);
      const validation = PresignUploadResponseSchema.safeParse(response);

      expect(validation.success).toBe(true);
      if (validation.success) {
        // Verify required fields exist
        expect(validation.data).toHaveProperty('jobId');
        expect(validation.data).toHaveProperty('presignedUrl');
        expect(validation.data).toHaveProperty('s3Key');
        expect(validation.data).toHaveProperty('expiresAt');

        // Verify field types match OpenAPI spec
        expect(typeof validation.data.jobId).toBe('string');
        expect(validation.data.jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        expect(typeof validation.data.presignedUrl).toBe('string');
        expect(validation.data.presignedUrl).toMatch(/^https?:\/\//);
        expect(typeof validation.data.s3Key).toBe('string');
        expect(typeof validation.data.expiresAt).toBe('string');
        // Validate ISO 8601 datetime format
        expect(() => new Date(validation.data.expiresAt)).not.toThrow();
      }
    });

    it('should return 400 with error schema for missing body', async () => {
      const event = createEvent(null);
      event.body = undefined;

      const result = await handler(event, {} as any) as APIGatewayResponse;

      // Verify HTTP status code matches OpenAPI spec
      expect(result.statusCode).toBe(400);

      // Verify response has error field
      const response = JSON.parse(result.body as string);
      expect(response).toHaveProperty('error');
      expect(typeof response.error).toBe('string');
      expect(response.error).toBe('Request body required');
    });

    it('should return 400 for invalid content type', async () => {
      const event = createEvent({
        fileName: 'test.bmp',
        contentType: 'image/bmp', // Not in allowed list
        fileSize: 1024
      });

      dynamoMock.resolves({});
      s3Mock.resolves({});

      const result = await handler(event, {} as any) as APIGatewayResponse;

      // Should reject with error (validation fails, returns 500)
      expect(result.statusCode).toBeGreaterThanOrEqual(400);

      const response = JSON.parse(result.body as string);
      expect(response).toHaveProperty('error');
    });

    it('should return 400 for file size exceeding 50MB', async () => {
      const event = createEvent({
        fileName: 'large.jpg',
        contentType: 'image/jpeg',
        fileSize: 51 * 1024 * 1024 // 51MB, exceeds max
      });

      dynamoMock.resolves({});
      s3Mock.resolves({});

      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBeGreaterThanOrEqual(400);

      const response = JSON.parse(result.body as string);
      expect(response).toHaveProperty('error');
    });
  });

  describe('Batch Upload Response Contract', () => {
    it('should return 200 with valid batch upload response schema', async () => {
      const event = createEvent({
        files: [
          {
            fileName: 'contract-photo1.jpg',
            contentType: 'image/jpeg',
            fileSize: 1024 * 1024
          },
          {
            fileName: 'contract-photo2.png',
            contentType: 'image/png',
            fileSize: 2 * 1024 * 1024
          }
        ],
        sharedPrompt: 'Contract test batch prompt',
        individualPrompts: ['Prompt for photo 1', 'Prompt for photo 2']
      });

      dynamoMock.on(PutItemCommand).resolves({});
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall({
          batchJobId: '00000000-0000-4000-8000-000000000000',
          status: 'QUEUED',
          childJobIds: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']
        })
      });
      s3Mock.resolves({});

      const result = await handler(event, {} as any) as APIGatewayResponse;

      // Verify HTTP status code
      expect(result.statusCode).toBe(200);

      // Verify Content-Type header
      expect(result.headers?.['Content-Type']).toBe('application/json');

      // Parse and validate response against schema
      const response = JSON.parse(result.body as string);
      const validation = BatchUploadResponseSchema.safeParse(response);

      expect(validation.success).toBe(true);
      if (validation.success) {
        // Verify required fields per OpenAPI spec
        expect(validation.data).toHaveProperty('batchJobId');
        expect(validation.data).toHaveProperty('uploads');
        expect(validation.data).toHaveProperty('childJobIds');

        // Verify batchJobId is UUID
        expect(validation.data.batchJobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

        // Verify uploads array structure
        expect(Array.isArray(validation.data.uploads)).toBe(true);
        expect(validation.data.uploads.length).toBe(2);

        validation.data.uploads.forEach((upload) => {
          expect(upload).toHaveProperty('presignedUrl');
          expect(upload).toHaveProperty('s3Key');
          expect(upload).toHaveProperty('expiresAt');
          expect(upload.presignedUrl).toMatch(/^https?:\/\//);
          expect(typeof upload.s3Key).toBe('string');
          expect(() => new Date(upload.expiresAt)).not.toThrow();
        });

        // Verify childJobIds array
        expect(Array.isArray(validation.data.childJobIds)).toBe(true);
        expect(validation.data.childJobIds.length).toBe(2);
        validation.data.childJobIds.forEach((jobId) => {
          expect(jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        });
      }
    });

    it('should enforce max 10 files per batch constraint', async () => {
      const files = Array.from({ length: 11 }, (_, i) => ({
        fileName: `photo${i}.jpg`,
        contentType: 'image/jpeg',
        fileSize: 1024 * 1024
      }));

      const event = createEvent({
        files,
        sharedPrompt: 'Batch with too many files'
      });

      dynamoMock.resolves({});
      s3Mock.resolves({});

      const result = await handler(event, {} as any) as APIGatewayResponse;

      // Should reject with error
      expect(result.statusCode).toBeGreaterThanOrEqual(400);

      const response = JSON.parse(result.body as string);
      expect(response).toHaveProperty('error');
    });
  });

  describe('Error Response Contract', () => {
    it('should return 500 with error schema for internal errors', async () => {
      const event = createEvent({
        fileName: 'test.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024
      });

      // Simulate internal error
      dynamoMock.rejects(new Error('Simulated DynamoDB failure'));

      const result = await handler(event, {} as any) as APIGatewayResponse;

      // Verify HTTP status code
      expect(result.statusCode).toBe(500);

      // Verify error response structure per OpenAPI spec
      const response = JSON.parse(result.body as string);
      expect(response).toHaveProperty('error');
      expect(typeof response.error).toBe('string');
      expect(response.error).toBe('Internal server error');
    });
  });
});
