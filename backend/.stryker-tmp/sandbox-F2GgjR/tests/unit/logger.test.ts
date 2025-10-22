// @ts-nocheck
// Mock the AWS Lambda Powertools Logger before importing
const mockInfo = jest.fn();
const mockWarn = jest.fn();
const mockError = jest.fn();
const mockDebug = jest.fn();

jest.mock('@aws-lambda-powertools/logger', () => {
  return {
    Logger: jest.fn().mockImplementation(() => ({
      info: mockInfo,
      warn: mockWarn,
      error: mockError,
      debug: mockDebug,
    })),
  };
});

import { logger } from '../../src/utils/logger';

describe('AppLogger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Structured Logging - Required Fields', () => {
    it('should emit structured fields for correlationId', () => {
      logger.info('Test message', { correlationId: 'corr-123' });

      expect(mockInfo).toHaveBeenCalledWith(
        'Test message',
        expect.objectContaining({ correlationId: 'corr-123' })
      );
    });

    it('should emit structured fields for requestId', () => {
      logger.info('Test message', { requestId: 'req-456' });

      expect(mockInfo).toHaveBeenCalledWith(
        'Test message',
        expect.objectContaining({ requestId: 'req-456' })
      );
    });

    it('should emit structured fields for jobId', () => {
      logger.info('Test message', { jobId: 'job-789' });

      expect(mockInfo).toHaveBeenCalledWith(
        'Test message',
        expect.objectContaining({ jobId: 'job-789' })
      );
    });

    it('should emit structured fields for userId', () => {
      logger.info('Test message', { userId: 'user-abc' });

      expect(mockInfo).toHaveBeenCalledWith(
        'Test message',
        expect.objectContaining({ userId: 'user-abc' })
      );
    });

    it('should emit multiple structured fields together', () => {
      logger.info('Test message', {
        correlationId: 'corr-123',
        requestId: 'req-456',
        jobId: 'job-789',
        userId: 'user-abc',
        operation: 'test-operation'
      });

      expect(mockInfo).toHaveBeenCalledWith(
        'Test message',
        expect.objectContaining({
          correlationId: 'corr-123',
          requestId: 'req-456',
          jobId: 'job-789',
          userId: 'user-abc',
          operation: 'test-operation'
        })
      );
    });
  });

  describe('formatContext - Field Filtering', () => {
    it('should filter out undefined values from context', () => {
      logger.info('Test message', {
        userId: 'user-123',
        jobId: undefined,
        requestId: 'req-456'
      });

      const callArgs = mockInfo.mock.calls[0][1];
      expect(callArgs).toHaveProperty('userId');
      expect(callArgs).toHaveProperty('requestId');
      expect(callArgs).not.toHaveProperty('jobId');
    });

    it('should filter out null values from context', () => {
      logger.info('Test message', {
        userId: 'user-123',
        jobId: null as any,
        requestId: 'req-456'
      });

      const callArgs = mockInfo.mock.calls[0][1];
      expect(callArgs).toHaveProperty('userId');
      expect(callArgs).toHaveProperty('requestId');
      expect(callArgs).not.toHaveProperty('jobId');
    });

    it('should return empty object when context is undefined', () => {
      logger.info('Test message', undefined);

      expect(mockInfo).toHaveBeenCalledWith('Test message', {});
    });
  });

  describe('Log Levels', () => {
    it('should log info messages with context', () => {
      logger.info('Info message', { userId: 'user-123' });

      expect(mockInfo).toHaveBeenCalledWith(
        'Info message',
        expect.objectContaining({ userId: 'user-123' })
      );
    });

    it('should log warn messages with context', () => {
      logger.warn('Warning message', { userId: 'user-123' });

      expect(mockWarn).toHaveBeenCalledWith(
        'Warning message',
        expect.objectContaining({ userId: 'user-123' })
      );
    });

    it('should log error messages with context', () => {
      const error = new Error('Test error');
      logger.error('Error message', { error, userId: 'user-123' });

      expect(mockError).toHaveBeenCalledWith(
        'Error message',
        expect.objectContaining({
          userId: 'user-123',
          error: expect.objectContaining({
            message: 'Test error',
            name: 'Error'
          })
        })
      );
    });

    it('should log debug messages with context', () => {
      logger.debug('Debug message', { userId: 'user-123' });

      expect(mockDebug).toHaveBeenCalledWith(
        'Debug message',
        expect.objectContaining({ userId: 'user-123' })
      );
    });
  });

  describe('Specialized Logging Methods', () => {
    it('should log request start with required fields', () => {
      logger.requestStart('presign', {
        requestId: 'req-123',
        userId: 'user-456'
      });

      expect(mockInfo).toHaveBeenCalledWith(
        'presign started',
        expect.objectContaining({
          operation: 'presign',
          requestId: 'req-123',
          userId: 'user-456',
          event: 'request_start',
          timestamp: expect.any(String)
        })
      );
    });

    it('should log request end with duration', () => {
      logger.requestEnd('presign', 125, {
        requestId: 'req-123',
        userId: 'user-456'
      });

      expect(mockInfo).toHaveBeenCalledWith(
        'presign completed',
        expect.objectContaining({
          operation: 'presign',
          duration: 125,
          requestId: 'req-123',
          userId: 'user-456',
          event: 'request_end',
          timestamp: expect.any(String)
        })
      );
    });

    it('should log job status changes', () => {
      logger.jobStatusChange('job-123', 'pending', 'processing', {
        userId: 'user-456'
      });

      expect(mockInfo).toHaveBeenCalledWith(
        'Job status changed',
        expect.objectContaining({
          jobId: 'job-123',
          previousStatus: 'pending',
          newStatus: 'processing',
          userId: 'user-456',
          event: 'job_status_change'
        })
      );
    });

    it('should log provider calls with success', () => {
      logger.providerCall('removebg', 'process', 250, true, {
        jobId: 'job-123'
      });

      expect(mockInfo).toHaveBeenCalledWith(
        'Provider removebg process succeeded',
        expect.objectContaining({
          provider: 'removebg',
          operation: 'process',
          duration: 250,
          success: true,
          jobId: 'job-123',
          event: 'provider_call'
        })
      );
    });

    it('should log provider calls with failure', () => {
      logger.providerCall('removebg', 'process', 250, false, {
        jobId: 'job-123'
      });

      expect(mockError).toHaveBeenCalledWith(
        'Provider removebg process failed',
        expect.objectContaining({
          provider: 'removebg',
          operation: 'process',
          duration: 250,
          success: false,
          jobId: 'job-123',
          event: 'provider_call'
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should extract error information from Error objects', () => {
      const error = new Error('Something went wrong');
      logger.error('Error occurred', { error, userId: 'user-123' });

      expect(mockError).toHaveBeenCalledWith(
        'Error occurred',
        expect.objectContaining({
          error: expect.objectContaining({
            name: 'Error',
            message: 'Something went wrong',
            stack: expect.any(String)
          })
        })
      );
    });

    it('should handle string errors', () => {
      logger.error('Error occurred', { error: 'String error', userId: 'user-123' });

      expect(mockError).toHaveBeenCalledWith(
        'Error occurred',
        expect.objectContaining({
          error: { message: 'String error' }
        })
      );
    });
  });

  describe('Child Logger', () => {
    it('should create child logger with persistent context', () => {
      const childLogger = logger.child({
        requestId: 'req-parent-123',
        userId: 'user-parent-456'
      });

      expect(childLogger).toBeDefined();

      // Child logger should be able to log
      childLogger.info('Child log message', { jobId: 'job-789' });

      // The child logger will have made its own call to the mock
      expect(mockInfo).toHaveBeenCalled();
    });
  });
});
