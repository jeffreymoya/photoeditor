/**
 * Unit tests for Error Handling Utilities
 * Tests AppErrorBuilder, ErrorHandler, and custom error classes
 */

import {
  AppErrorBuilder,
  ErrorHandler,
  JobNotFoundError,
  InvalidJobStatusError,
  PresignedUrlExpiredError
} from '../../../src/utils/errors';
import { ErrorType, InternalError } from '@photoeditor/shared';

describe('AppErrorBuilder', () => {
  describe('validation', () => {
    it('should create ValidationError with required fields', () => {
      const error = AppErrorBuilder.validation('VAL_001', 'Validation failed');

      expect(error.type).toBe(ErrorType.VALIDATION);
      expect(error.code).toBe('VAL_001');
      expect(error.message).toBe('Validation failed');
      expect(error.timestamp).toBeDefined();
      expect(error.requestId).toBeDefined();
    });

    it('should include fieldErrors when provided', () => {
      const fieldErrors = {
        email: ['Invalid email format'],
        password: ['Too short', 'Missing uppercase']
      };

      const error = AppErrorBuilder.validation('VAL_002', 'Invalid input', fieldErrors);

      expect(error.fieldErrors).toEqual(fieldErrors);
    });

    it('should include details when provided', () => {
      const details = { context: 'signup', userId: '123' };
      const error = AppErrorBuilder.validation('VAL_003', 'Failed', undefined, details);

      expect(error.details).toEqual(details);
    });

    it('should not include fieldErrors when undefined', () => {
      const error = AppErrorBuilder.validation('VAL_004', 'Error');

      expect('fieldErrors' in error).toBe(false);
    });

    it('should not include details when undefined', () => {
      const error = AppErrorBuilder.validation('VAL_005', 'Error');

      expect('details' in error).toBe(false);
    });
  });

  describe('provider', () => {
    it('should create ProviderError with required fields', () => {
      const error = AppErrorBuilder.provider('Gemini', 'PROV_001', 'Provider failed');

      expect(error.type).toBe(ErrorType.PROVIDER_ERROR);
      expect(error.provider).toBe('Gemini');
      expect(error.code).toBe('PROV_001');
      expect(error.message).toBe('Provider failed');
      expect(error.retryable).toBe(false);
      expect(error.timestamp).toBeDefined();
      expect(error.requestId).toBeDefined();
    });

    it('should set retryable flag', () => {
      const error = AppErrorBuilder.provider('Seedream', 'PROV_002', 'Timeout', true);

      expect(error.retryable).toBe(true);
    });

    it('should include providerCode when provided', () => {
      const error = AppErrorBuilder.provider('Gemini', 'PROV_003', 'Error', false, 'GEMINI_500');

      expect(error.providerCode).toBe('GEMINI_500');
    });

    it('should include details when provided', () => {
      const details = { attempt: 3, duration: 5000 };
      const error = AppErrorBuilder.provider('Gemini', 'PROV_004', 'Failed', false, undefined, details);

      expect(error.details).toEqual(details);
    });

    it('should not include providerCode when undefined', () => {
      const error = AppErrorBuilder.provider('Gemini', 'PROV_005', 'Error');

      expect('providerCode' in error).toBe(false);
    });
  });

  describe('internal', () => {
    it('should create InternalError with required fields', () => {
      const error = AppErrorBuilder.internal('INT_001', 'Internal error');

      expect(error.type).toBe(ErrorType.INTERNAL_ERROR);
      expect(error.code).toBe('INT_001');
      expect(error.message).toBe('Internal error');
      expect(error.timestamp).toBeDefined();
      expect(error.requestId).toBeDefined();
    });

    it('should include stack trace when Error is provided', () => {
      const sourceError = new Error('Original error');
      const error = AppErrorBuilder.internal('INT_002', 'Wrapped error', sourceError);

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Error: Original error');
    });

    it('should include context when provided', () => {
      const context = { userId: '123', operation: 'createJob' };
      const error = AppErrorBuilder.internal('INT_003', 'Error', undefined, context);

      expect(error.context).toEqual(context);
    });

    it('should not include stack when no Error provided', () => {
      const error = AppErrorBuilder.internal('INT_004', 'Error');

      expect('stack' in error).toBe(false);
    });

    it('should not include context when undefined', () => {
      const error = AppErrorBuilder.internal('INT_005', 'Error');

      expect('context' in error).toBe(false);
    });
  });

  describe('base', () => {
    it('should create BaseError with specified type', () => {
      const error = AppErrorBuilder.base(ErrorType.NOT_FOUND, 'BASE_001', 'Not found');

      expect(error.type).toBe(ErrorType.NOT_FOUND);
      expect(error.code).toBe('BASE_001');
      expect(error.message).toBe('Not found');
      expect(error.timestamp).toBeDefined();
      expect(error.requestId).toBeDefined();
    });

    it('should include details when provided', () => {
      const details = { resource: 'Job', id: '123' };
      const error = AppErrorBuilder.base(ErrorType.CONFLICT, 'BASE_002', 'Conflict', details);

      expect(error.details).toEqual(details);
    });
  });

  describe('notFound', () => {
    it('should create NOT_FOUND error with resource details', () => {
      const error = AppErrorBuilder.notFound('Job', 'job-123');

      expect(error.type).toBe(ErrorType.NOT_FOUND);
      expect(error.code).toBe('RESOURCE_NOT_FOUND');
      expect(error.message).toBe('Job not found');
      expect(error.details).toEqual({
        resource: 'Job',
        identifier: 'job-123'
      });
    });

    it('should handle different resource types', () => {
      const error = AppErrorBuilder.notFound('User', 'user-456');

      expect(error.message).toBe('User not found');
      expect(error.details?.identifier).toBe('user-456');
    });
  });

  describe('unauthorized', () => {
    it('should create AUTHENTICATION error with default message', () => {
      const error = AppErrorBuilder.unauthorized();

      expect(error.type).toBe(ErrorType.AUTHENTICATION);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe('Unauthorized');
    });

    it('should accept custom message', () => {
      const error = AppErrorBuilder.unauthorized('Invalid API key');

      expect(error.message).toBe('Invalid API key');
    });
  });

  describe('forbidden', () => {
    it('should create AUTHORIZATION error with default message', () => {
      const error = AppErrorBuilder.forbidden();

      expect(error.type).toBe(ErrorType.AUTHORIZATION);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toBe('Forbidden');
    });

    it('should accept custom message', () => {
      const error = AppErrorBuilder.forbidden('Insufficient permissions');

      expect(error.message).toBe('Insufficient permissions');
    });
  });

  describe('conflict', () => {
    it('should create CONFLICT error with resource info', () => {
      const error = AppErrorBuilder.conflict('Job', 'Job already exists');

      expect(error.type).toBe(ErrorType.CONFLICT);
      expect(error.code).toBe('RESOURCE_CONFLICT');
      expect(error.message).toBe('Job already exists');
      expect(error.details).toEqual({ resource: 'Job' });
    });
  });

  describe('rateLimit', () => {
    it('should create RATE_LIMIT error with default message', () => {
      const error = AppErrorBuilder.rateLimit();

      expect(error.type).toBe(ErrorType.RATE_LIMIT);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.message).toBe('Rate limit exceeded');
    });

    it('should accept custom message', () => {
      const error = AppErrorBuilder.rateLimit('Too many requests, please wait');

      expect(error.message).toBe('Too many requests, please wait');
    });
  });

  describe('serviceUnavailable', () => {
    it('should create SERVICE_UNAVAILABLE error with default message', () => {
      const error = AppErrorBuilder.serviceUnavailable('DynamoDB');

      expect(error.type).toBe(ErrorType.SERVICE_UNAVAILABLE);
      expect(error.code).toBe('SERVICE_UNAVAILABLE');
      expect(error.message).toBe('DynamoDB is currently unavailable');
      expect(error.details).toEqual({ service: 'DynamoDB' });
    });

    it('should accept custom message', () => {
      const error = AppErrorBuilder.serviceUnavailable('S3', 'S3 maintenance in progress');

      expect(error.message).toBe('S3 maintenance in progress');
    });
  });
});

describe('ErrorHandler', () => {
  describe('getHttpStatusCode', () => {
    it('should return 400 for VALIDATION error', () => {
      const error = AppErrorBuilder.validation('VAL', 'Invalid');
      expect(ErrorHandler.getHttpStatusCode(error)).toBe(400);
    });

    it('should return 404 for NOT_FOUND error', () => {
      const error = AppErrorBuilder.notFound('Job', '123');
      expect(ErrorHandler.getHttpStatusCode(error)).toBe(404);
    });

    it('should return 401 for AUTHENTICATION error', () => {
      const error = AppErrorBuilder.unauthorized();
      expect(ErrorHandler.getHttpStatusCode(error)).toBe(401);
    });

    it('should return 403 for AUTHORIZATION error', () => {
      const error = AppErrorBuilder.forbidden();
      expect(ErrorHandler.getHttpStatusCode(error)).toBe(403);
    });

    it('should return 409 for CONFLICT error', () => {
      const error = AppErrorBuilder.conflict('Resource', 'Conflict');
      expect(ErrorHandler.getHttpStatusCode(error)).toBe(409);
    });

    it('should return 429 for RATE_LIMIT error', () => {
      const error = AppErrorBuilder.rateLimit();
      expect(ErrorHandler.getHttpStatusCode(error)).toBe(429);
    });

    it('should return 500 for INTERNAL_ERROR', () => {
      const error = AppErrorBuilder.internal('INT', 'Internal');
      expect(ErrorHandler.getHttpStatusCode(error)).toBe(500);
    });

    it('should return 503 for SERVICE_UNAVAILABLE', () => {
      const error = AppErrorBuilder.serviceUnavailable('Service');
      expect(ErrorHandler.getHttpStatusCode(error)).toBe(503);
    });
  });

  describe('toStandardApiResponse', () => {
    it('should create API Gateway response with proper structure', () => {
      const error = AppErrorBuilder.validation('VAL_001', 'Invalid input');
      const response = ErrorHandler.toStandardApiResponse(error, 'req-123');

      // Type guard to assert response is an object, not a string
      expect(typeof response).toBe('object');
      if (typeof response === 'string') throw new Error('Expected object response');

      expect(response.statusCode).toBe(400);
      expect(response.headers).toEqual({
        'Content-Type': 'application/json',
        'x-request-id': 'req-123'
      });
      expect(response.body).toBeDefined();

      const body = JSON.parse(response.body);
      expect(body.code).toBe('VAL_001');
      expect(body.detail).toBe('Invalid input');
    });

    it('should include traceparent header when provided', () => {
      const error = AppErrorBuilder.internal('INT_001', 'Error');
      const response = ErrorHandler.toStandardApiResponse(error, 'req-123', 'trace-parent-value');

      // Type guard
      if (typeof response === 'string') throw new Error('Expected object response');

      expect(response.headers?.traceparent).toBe('trace-parent-value');
    });

    it('should include validation fieldErrors', () => {
      const error = AppErrorBuilder.validation('VAL', 'Invalid', {
        email: ['Invalid format']
      });
      const response = ErrorHandler.toStandardApiResponse(error, 'req-123');

      // Type guard
      if (typeof response === 'string') throw new Error('Expected object response');

      const body = JSON.parse(response.body);
      expect(body.fieldErrors).toEqual({ email: ['Invalid format'] });
    });

    it('should include provider-specific fields', () => {
      const error = AppErrorBuilder.provider('Gemini', 'PROV', 'Failed', true, 'GEMINI_500');
      const response = ErrorHandler.toStandardApiResponse(error, 'req-123');

      // Type guard
      if (typeof response === 'string') throw new Error('Expected object response');

      const body = JSON.parse(response.body);
      expect(body.provider).toBe('Gemini');
      expect(body.providerCode).toBe('GEMINI_500');
      expect(body.retryable).toBe(true);
    });

    it('should include internal error context in non-production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const sourceError = new Error('Source');
      const error = AppErrorBuilder.internal('INT', 'Error', sourceError, { userId: '123' });
      const response = ErrorHandler.toStandardApiResponse(error, 'req-123');

      // Type guard
      if (typeof response === 'string') throw new Error('Expected object response');

      const body = JSON.parse(response.body);
      expect(body.context).toEqual({ userId: '123' });
      expect(body.stack).toBeDefined();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('createSimpleErrorResponse', () => {
    it('should create simple error response', () => {
      const response = ErrorHandler.createSimpleErrorResponse(
        ErrorType.VALIDATION,
        'MISSING_BODY',
        'Request body is required',
        'req-456'
      );

      // Type guard
      if (typeof response === 'string') throw new Error('Expected object response');

      expect(response.statusCode).toBe(400);
      expect(response.headers).toEqual({
        'Content-Type': 'application/json',
        'x-request-id': 'req-456'
      });

      const body = JSON.parse(response.body);
      expect(body.code).toBe('MISSING_BODY');
      expect(body.detail).toBe('Request body is required');
    });

    it('should include traceparent when provided', () => {
      const response = ErrorHandler.createSimpleErrorResponse(
        ErrorType.NOT_FOUND,
        'NOT_FOUND',
        'Resource not found',
        'req-789',
        'trace-value'
      );

      // Type guard
      if (typeof response === 'string') throw new Error('Expected object response');

      expect(response.headers?.traceparent).toBe('trace-value');
    });
  });

  describe('isRetryable', () => {
    it('should return true for retryable provider errors', () => {
      const error = AppErrorBuilder.provider('Gemini', 'PROV', 'Timeout', true);
      expect(ErrorHandler.isRetryable(error)).toBe(true);
    });

    it('should return false for non-retryable provider errors', () => {
      const error = AppErrorBuilder.provider('Gemini', 'PROV', 'Invalid API key', false);
      expect(ErrorHandler.isRetryable(error)).toBe(false);
    });

    it('should return true for SERVICE_UNAVAILABLE', () => {
      const error = AppErrorBuilder.serviceUnavailable('DynamoDB');
      expect(ErrorHandler.isRetryable(error)).toBe(true);
    });

    it('should return true for RATE_LIMIT', () => {
      const error = AppErrorBuilder.rateLimit();
      expect(ErrorHandler.isRetryable(error)).toBe(true);
    });

    it('should return false for VALIDATION errors', () => {
      const error = AppErrorBuilder.validation('VAL', 'Invalid');
      expect(ErrorHandler.isRetryable(error)).toBe(false);
    });

    it('should return false for INTERNAL_ERROR', () => {
      const error = AppErrorBuilder.internal('INT', 'Error');
      expect(ErrorHandler.isRetryable(error)).toBe(false);
    });
  });

  describe('shouldNotifyUser', () => {
    it('should return false for VALIDATION errors', () => {
      const error = AppErrorBuilder.validation('VAL', 'Invalid');
      expect(ErrorHandler.shouldNotifyUser(error)).toBe(false);
    });

    it('should return false for AUTHENTICATION errors', () => {
      const error = AppErrorBuilder.unauthorized();
      expect(ErrorHandler.shouldNotifyUser(error)).toBe(false);
    });

    it('should return false for AUTHORIZATION errors', () => {
      const error = AppErrorBuilder.forbidden();
      expect(ErrorHandler.shouldNotifyUser(error)).toBe(false);
    });

    it('should return false for NOT_FOUND errors', () => {
      const error = AppErrorBuilder.notFound('Job', '123');
      expect(ErrorHandler.shouldNotifyUser(error)).toBe(false);
    });

    it('should return false for CONFLICT errors', () => {
      const error = AppErrorBuilder.conflict('Resource', 'Conflict');
      expect(ErrorHandler.shouldNotifyUser(error)).toBe(false);
    });

    it('should return true for INTERNAL_ERROR', () => {
      const error = AppErrorBuilder.internal('INT', 'Error');
      expect(ErrorHandler.shouldNotifyUser(error)).toBe(true);
    });

    it('should return true for PROVIDER_ERROR', () => {
      const error = AppErrorBuilder.provider('Gemini', 'PROV', 'Failed');
      expect(ErrorHandler.shouldNotifyUser(error)).toBe(true);
    });

    it('should return true for SERVICE_UNAVAILABLE', () => {
      const error = AppErrorBuilder.serviceUnavailable('S3');
      expect(ErrorHandler.shouldNotifyUser(error)).toBe(true);
    });
  });

  describe('fromError', () => {
    it('should return AppError if already structured', () => {
      const appError = AppErrorBuilder.validation('VAL', 'Invalid');
      const result = ErrorHandler.fromError(appError as unknown as Error);

      expect(result).toEqual(appError);
    });

    it('should convert NoSuchKey to NOT_FOUND', () => {
      const error = new Error('Key not found');
      error.name = 'NoSuchKey';

      const result = ErrorHandler.fromError(error);

      expect(result.type).toBe(ErrorType.NOT_FOUND);
      expect(result.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('should convert ConditionalCheckFailedException to CONFLICT', () => {
      const error = new Error('Condition failed');
      error.name = 'ConditionalCheckFailedException';

      const result = ErrorHandler.fromError(error);

      expect(result.type).toBe(ErrorType.CONFLICT);
      expect(result.code).toBe('RESOURCE_CONFLICT');
    });

    it('should convert ThrottlingException to RATE_LIMIT', () => {
      const error = new Error('Throttled');
      error.name = 'ThrottlingException';

      const result = ErrorHandler.fromError(error);

      expect(result.type).toBe(ErrorType.RATE_LIMIT);
      expect(result.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should convert TooManyRequestsException to RATE_LIMIT', () => {
      const error = new Error('Too many requests');
      error.name = 'TooManyRequestsException';

      const result = ErrorHandler.fromError(error);

      expect(result.type).toBe(ErrorType.RATE_LIMIT);
    });

    it('should convert ServiceUnavailableException to SERVICE_UNAVAILABLE', () => {
      const error = new Error('Service unavailable');
      error.name = 'ServiceUnavailableException';

      const result = ErrorHandler.fromError(error);

      expect(result.type).toBe(ErrorType.SERVICE_UNAVAILABLE);
    });

    it('should convert unknown errors to INTERNAL_ERROR', () => {
      const error = new Error('Unknown error');

      const result = ErrorHandler.fromError(error);

      expect(result.type).toBe(ErrorType.INTERNAL_ERROR);
      expect(result.code).toBe('UNEXPECTED_ERROR');
      expect(result.message).toBe('Unknown error');
    });

    it('should include context in converted error', () => {
      const error = new Error('Test error');
      const context = { userId: '123', operation: 'test' };

      const result = ErrorHandler.fromError(error, context);

      const internalError = result as InternalError;
      expect(internalError.context).toEqual(context);
    });
  });
});

describe('Custom Error Classes', () => {
  describe('JobNotFoundError', () => {
    it('should create error with job ID', () => {
      const error = new JobNotFoundError('job-123');

      expect(error.message).toBe('Job job-123 not found');
      expect(error.name).toBe('JobNotFoundError');
    });
  });

  describe('InvalidJobStatusError', () => {
    it('should create error with status details', () => {
      const error = new InvalidJobStatusError('job-456', 'COMPLETED', 'PROCESSING');

      expect(error.message).toBe('Job job-456 has status COMPLETED, expected PROCESSING');
      expect(error.name).toBe('InvalidJobStatusError');
    });
  });

  describe('PresignedUrlExpiredError', () => {
    it('should create error with URL', () => {
      const url = 'https://example.com/expired';
      const error = new PresignedUrlExpiredError(url);

      expect(error.message).toBe(`Presigned URL has expired: ${url}`);
      expect(error.name).toBe('PresignedUrlExpiredError');
    });
  });
});
