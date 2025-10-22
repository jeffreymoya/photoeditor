// @ts-nocheck
// AWS event builders for testing
// Centralized builders for AWS events to reduce duplication

import { APIGatewayProxyEvent, APIGatewayProxyEventV2, S3Event, SQSEvent } from 'aws-lambda';

/**
 * Create a minimal API Gateway proxy event (v1) with overrides
 */
export const makeApiEvent = (overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent => ({
  body: null,
  headers: {
    'content-type': 'application/json',
  },
  multiValueHeaders: {},
  httpMethod: 'GET',
  isBase64Encoded: false,
  path: '/',
  pathParameters: null,
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {
    accountId: '123456789012',
    apiId: 'test-api-id',
    protocol: 'HTTP/1.1',
    httpMethod: 'GET',
    path: '/',
    stage: 'test',
    requestId: 'test-request-id',
    requestTimeEpoch: 1704067200000,
    resourceId: 'test-resource-id',
    resourcePath: '/',
    identity: {
      accessKey: null,
      accountId: null,
      apiKey: null,
      apiKeyId: null,
      caller: null,
      clientCert: null,
      cognitoAuthenticationProvider: null,
      cognitoAuthenticationType: null,
      cognitoIdentityId: null,
      cognitoIdentityPoolId: null,
      principalOrgId: null,
      sourceIp: '127.0.0.1',
      user: null,
      userAgent: 'test-user-agent',
      userArn: null,
    },
    authorizer: null,
  },
  resource: '/',
  ...overrides,
});

/**
 * Create a minimal API Gateway proxy event (v2) with overrides
 */
export const makeApiEventV2 = (overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 => ({
  version: '2.0',
  routeKey: '$default',
  rawPath: '/',
  rawQueryString: '',
  headers: {
    'content-type': 'application/json',
  },
  requestContext: {
    accountId: '123456789012',
    apiId: 'test-api-id',
    domainName: 'test.execute-api.us-east-1.amazonaws.com',
    domainPrefix: 'test',
    http: {
      method: 'POST',
      path: '/',
      protocol: 'HTTP/1.1',
      sourceIp: '127.0.0.1',
      userAgent: 'test-user-agent',
    },
    requestId: 'test-request-id',
    routeKey: '$default',
    stage: '$default',
    time: '01/Jan/2024:00:00:00 +0000',
    timeEpoch: 1704067200000,
  },
  isBase64Encoded: false,
  ...overrides,
});

/**
 * Create an S3 event record with overrides
 */
export const makeS3Record = (overrides: {
  bucket?: string;
  key?: string;
  size?: number;
  eventName?: string;
} = {}) => ({
  eventVersion: '2.1',
  eventSource: 'aws:s3',
  awsRegion: 'us-east-1',
  eventTime: '2024-01-01T00:00:00.000Z',
  eventName: overrides.eventName || 's3:ObjectCreated:Put',
  userIdentity: {
    principalId: 'test-principal',
  },
  requestParameters: {
    sourceIPAddress: '127.0.0.1',
  },
  responseElements: {
    'x-amz-request-id': 'test-request-id',
    'x-amz-id-2': 'test-id-2',
  },
  s3: {
    s3SchemaVersion: '1.0',
    configurationId: 'test-config-id',
    bucket: {
      name: overrides.bucket || 'test-bucket',
      ownerIdentity: {
        principalId: 'test-principal',
      },
      arn: `arn:aws:s3:::${overrides.bucket || 'test-bucket'}`,
    },
    object: {
      key: overrides.key || 'test-key',
      size: overrides.size || 1024,
      eTag: 'test-etag',
      sequencer: 'test-sequencer',
    },
  },
});

/**
 * Create a complete S3 event with one or more records
 */
export const makeS3Event = (records: ReturnType<typeof makeS3Record>[] = []): S3Event => ({
  Records: records.length > 0 ? records : [makeS3Record()],
});

/**
 * Create an SQS event with a JSON body
 */
export const makeSQSEventWithBody = (body: unknown): SQSEvent => ({
  Records: [
    {
      messageId: 'test-message-id',
      receiptHandle: 'test-receipt-handle',
      body: JSON.stringify(body),
      attributes: {
        ApproximateReceiveCount: '1',
        SentTimestamp: '1704067200000',
        SenderId: 'test-sender-id',
        ApproximateFirstReceiveTimestamp: '1704067200000',
      },
      messageAttributes: {},
      md5OfBody: 'test-md5',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:test-queue',
      awsRegion: 'us-east-1',
    },
  ],
});
