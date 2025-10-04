// Test setup file
// Set up environment variables for testing
const nock = require('nock');

// Save original environment
const originalEnv = { ...process.env };

// Set deterministic test environment
process.env.AWS_REGION = 'us-east-1';
process.env.PROJECT_NAME = 'photoeditor';
process.env.NODE_ENV = 'test';
process.env.TEMP_BUCKET_NAME = 'test-temp-bucket';
process.env.FINAL_BUCKET_NAME = 'test-final-bucket';
process.env.JOBS_TABLE_NAME = 'test-jobs-table';
process.env.SNS_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:test-topic';
process.env.TEST_RUN_ID = process.env.TEST_RUN_ID || 'test-run-' + Date.now();
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.NO_COLOR = '1';

// Unset AWS credentials for unit tests
delete process.env.AWS_ACCESS_KEY_ID;
delete process.env.AWS_SECRET_ACCESS_KEY;

// Network isolation - disable all network by default
beforeAll(() => {
  nock.disableNetConnect();
  // Allow localhost for integration tests (will be overridden in integration suites)
  if (process.env.ALLOW_LOCALHOST === 'true') {
    nock.enableNetConnect('127.0.0.1');
  }
});

afterAll(() => {
  nock.enableNetConnect();
  nock.cleanAll();
});

// Time control - use fake timers by default
// Individual test suites can override with jest.useRealTimers() in their beforeEach
let usingFakeTimers = false;

beforeEach(() => {
  jest.useFakeTimers();
  usingFakeTimers = true;
  jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
});

afterEach(() => {
  if (usingFakeTimers && jest.isMockFunction(setTimeout)) {
    try {
      jest.runOnlyPendingTimers();
    } catch (e) {
      // Ignore errors if timers were already cleared
    }
  }
  jest.useRealTimers();
  usingFakeTimers = false;
});

// Stub UUID for deterministic tests
jest.mock('uuid', () => ({
  v4: () => '00000000-0000-4000-8000-000000000000'
}));

// Fail tests on unexpected console.error/console.warn
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

const toMsg = (args) => {
  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
};

beforeEach(() => {
  console.error = (...args) => {
    originalConsoleError(...args);
    throw new Error('Unexpected console.error: ' + toMsg(args));
  };
  console.warn = (...args) => {
    originalConsoleWarn(...args);
    throw new Error('Unexpected console.warn: ' + toMsg(args));
  };
});

afterEach(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  // Restore environment
  process.env = { ...originalEnv };
  // Reset modules to clear any module-level state
  jest.resetModules();
});

// Note: AWS SDK mocking has been moved from here to individual tests.
// Use aws-sdk-client-mock for per-test expectations instead of global mocks.
// Example:
//   import { mockClient } from 'aws-sdk-client-mock';
//   import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
//   const s3Mock = mockClient(S3Client);
//   beforeEach(() => s3Mock.reset());
//   it('test', async () => {
//     s3Mock.on(PutObjectCommand).resolves({});
//     // test code
//   });