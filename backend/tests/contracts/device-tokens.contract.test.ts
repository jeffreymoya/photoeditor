/**
 * Contract Tests for Device Token Handler
 *
 * Validates that device token handler responses match shared schema contracts
 * per standards/testing-standards.md and standards/shared-contracts-tier.md.
 *
 * Tests:
 * - Device token registration (POST)
 * - Device token deactivation (DELETE)
 * - Error response format compliance
 * - Schema boundary validation (Zod-at-boundaries)
 */

import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import {
  DeviceTokenRegistrationSchema
} from '@photoeditor/shared';

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
process.env.DEVICE_TOKEN_TABLE_NAME = 'test-device-tokens-table';

const dynamoMock = mockClient(DynamoDBClient);

// Import handler after mocks are set up
import { handler } from '../../src/lambdas/deviceToken';

// Type guard for API Gateway response
type APIGatewayResponse = Exclude<Awaited<ReturnType<typeof handler>>, string>;

describe('Device Token Handler Contract Tests', () => {
  beforeEach(() => {
    dynamoMock.reset();
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    jest.useRealTimers();

    // Mock successful DynamoDB operations
    dynamoMock.on(PutItemCommand).resolves({});
    dynamoMock.on(UpdateItemCommand).resolves({});
  });

  const createPostEvent = (body: any): APIGatewayProxyEventV2 => ({
    version: '2.0',
    routeKey: 'POST /v1/device-tokens',
    rawPath: '/v1/device-tokens',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/v1/device-tokens',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'test-request-id',
      routeKey: 'POST /v1/device-tokens',
      stage: '$default',
      time: '01/Jan/2024:00:00:00 +0000',
      timeEpoch: 1704067200000,
      authorizer: {
        claims: {
          sub: 'test-user-123'
        }
      }
    } as any,
    body: JSON.stringify(body),
    isBase64Encoded: false
  });

  const createDeleteEvent = (deviceId: string): APIGatewayProxyEventV2 => ({
    version: '2.0',
    routeKey: 'DELETE /v1/device-tokens',
    rawPath: '/v1/device-tokens',
    rawQueryString: `deviceId=${deviceId}`,
    headers: {},
    queryStringParameters: { deviceId },
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'DELETE',
        path: '/v1/device-tokens',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'test-request-id',
      routeKey: 'DELETE /v1/device-tokens',
      stage: '$default',
      time: '01/Jan/2024:00:00:00 +0000',
      timeEpoch: 1704067200000,
      authorizer: {
        claims: {
          sub: 'test-user-123'
        }
      }
    } as any,
    isBase64Encoded: false
  });

  describe('POST /v1/device-tokens - Register Device Token', () => {
      const requestBody = {
        expoPushToken: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
        platform: 'ios',
        deviceId: 'test-device-123'
      };

      // Validate request matches schema
      const requestValidation = DeviceTokenRegistrationSchema.safeParse(requestBody);
      expect(requestValidation.success).toBe(true);

      const event = createPostEvent(requestBody);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(200);
      expect(result.body).toBeDefined();

      // Parse and validate response against schema
      const responseBody = JSON.parse(result.body as string);
      
      // The handler returns { success: true, deviceToken: ... }
      // So we need to check the actual response structure
      expect(responseBody.success).toBe(true);
      expect(responseBody.deviceToken).toBeDefined();
    });

    it('should return 400 for invalid request format', async () => {
      const invalidBody = {
        expoPushToken: '', // Invalid: empty string
        platform: 'ios',
        deviceId: 'test-device-123'
      };

      const event = createPostEvent(invalidBody);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string);
      expect(responseBody.error).toBeDefined();
    });

    it('should return 400 for invalid platform', async () => {
      const invalidBody = {
        expoPushToken: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
        platform: 'windows', // Invalid: not ios or android
        deviceId: 'test-device-123'
      };

      const event = createPostEvent(invalidBody);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string);
      expect(responseBody.error).toBeDefined();
    });

    it('should return 400 for missing request body', async () => {
      const event = createPostEvent(null);
      event.body = undefined;

      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string);
      expect(responseBody.error).toBe('Request body required');
    });

    it('should accept android platform', async () => {
      const requestBody = {
        expoPushToken: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
        platform: 'android',
        deviceId: 'test-device-456'
      };

      const requestValidation = DeviceTokenRegistrationSchema.safeParse(requestBody);
      expect(requestValidation.success).toBe(true);

      const event = createPostEvent(requestBody);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(200);
      const responseBody = JSON.parse(result.body as string);
      expect(responseBody.success).toBe(true);
    });
  });

  describe('DELETE /v1/device-tokens - Deactivate Device Token', () => {
      const deviceId = 'test-device-123';
      const event = createDeleteEvent(deviceId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(200);
      expect(result.body).toBeDefined();

      // Parse and validate response
      const responseBody = JSON.parse(result.body as string);
      expect(responseBody.success).toBe(true);
      expect(responseBody.message).toBe('Device token deactivated successfully');
    });

    it('should return 400 for missing deviceId parameter', async () => {
      const event = createDeleteEvent('');
      event.queryStringParameters = {};

      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string);
      expect(responseBody.error).toBe('deviceId query parameter required');
    });
  });

  describe('HTTP Method Validation', () => {
    it('should return 405 for unsupported HTTP method', async () => {
      const event = createPostEvent({});
      // Change to unsupported method
      event.requestContext.http.method = 'PUT';

      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(405);
      const responseBody = JSON.parse(result.body as string);
      expect(responseBody.error).toBe('Method not allowed');
    });
  });

  describe('Response Headers', () => {
    it('should include Content-Type header in response', async () => {
      const requestBody = {
        expoPushToken: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
        platform: 'ios',
        deviceId: 'test-device-123'
      };

      const event = createPostEvent(requestBody);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.headers).toBeDefined();
      expect(result.headers?.['Content-Type']).toBe('application/json');
    });
  });
});
