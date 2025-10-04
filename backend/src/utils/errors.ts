import {
  ErrorType,
  BaseError,
  ValidationError,
  ProviderError,
  InternalError,
  AppError,
  ERROR_HTTP_STATUS,
  ERROR_JOB_STATUS
} from '@photoeditor/shared';
import { v4 as uuidv4 } from 'uuid';

export class AppErrorBuilder {
  static validation(
    code: string,
    message: string,
    fieldErrors?: Record<string, string[]>,
    details?: Record<string, unknown>
  ): ValidationError {
    return {
      type: ErrorType.VALIDATION,
      code,
      message,
      ...(fieldErrors !== undefined && { fieldErrors }),
      ...(details !== undefined && { details }),
      timestamp: new Date().toISOString(),
      requestId: uuidv4()
    };
  }

  static provider(
    provider: string,
    code: string,
    message: string,
    retryable: boolean = false,
    providerCode?: string,
    details?: Record<string, unknown>
  ): ProviderError {
    return {
      type: ErrorType.PROVIDER_ERROR,
      provider,
      code,
      message,
      retryable,
      ...(providerCode !== undefined && { providerCode }),
      ...(details !== undefined && { details }),
      timestamp: new Date().toISOString(),
      requestId: uuidv4()
    };
  }

  static internal(
    code: string,
    message: string,
    error?: Error,
    context?: Record<string, unknown>
  ): InternalError {
    return {
      type: ErrorType.INTERNAL_ERROR,
      code,
      message,
      ...(error?.stack !== undefined && { stack: error.stack }),
      ...(context !== undefined && { context }),
      timestamp: new Date().toISOString(),
      requestId: uuidv4()
    };
  }

  static base(
    type: ErrorType,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ): BaseError {
    return {
      type,
      code,
      message,
      ...(details !== undefined && { details }),
      timestamp: new Date().toISOString(),
      requestId: uuidv4()
    };
  }

  static notFound(resource: string, identifier: string): BaseError {
    return this.base(
      ErrorType.NOT_FOUND,
      'RESOURCE_NOT_FOUND',
      `${resource} not found`,
      { resource, identifier }
    );
  }

  static unauthorized(message: string = 'Unauthorized'): BaseError {
    return this.base(ErrorType.AUTHENTICATION, 'UNAUTHORIZED', message);
  }

  static forbidden(message: string = 'Forbidden'): BaseError {
    return this.base(ErrorType.AUTHORIZATION, 'FORBIDDEN', message);
  }

  static conflict(resource: string, message: string): BaseError {
    return this.base(
      ErrorType.CONFLICT,
      'RESOURCE_CONFLICT',
      message,
      { resource }
    );
  }

  static rateLimit(message: string = 'Rate limit exceeded'): BaseError {
    return this.base(ErrorType.RATE_LIMIT, 'RATE_LIMIT_EXCEEDED', message);
  }

  static serviceUnavailable(service: string, message?: string): BaseError {
    return this.base(
      ErrorType.SERVICE_UNAVAILABLE,
      'SERVICE_UNAVAILABLE',
      message || `${service} is currently unavailable`,
      { service }
    );
  }
}

export class ErrorHandler {
  static getHttpStatusCode(error: AppError): number {
    return ERROR_HTTP_STATUS[error.type] || 500;
  }

  static getJobStatus(error: AppError): string | null {
    return ERROR_JOB_STATUS[error.type as keyof typeof ERROR_JOB_STATUS] || null;
  }

  static toApiResponse(error: AppError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      },
      timestamp: error.timestamp,
      requestId: error.requestId
    };
  }

  static isRetryable(error: AppError): boolean {
    if (error.type === ErrorType.PROVIDER_ERROR) {
      return (error as ProviderError).retryable;
    }

    return error.type === ErrorType.SERVICE_UNAVAILABLE ||
           error.type === ErrorType.RATE_LIMIT;
  }

  static shouldNotifyUser(error: AppError): boolean {
    // Don't notify for validation errors or expected business logic errors
    return ![
      ErrorType.VALIDATION,
      ErrorType.AUTHENTICATION,
      ErrorType.AUTHORIZATION,
      ErrorType.NOT_FOUND,
      ErrorType.CONFLICT
    ].includes(error.type);
  }

  static fromError(error: Error, context?: { operation?: string; userId?: string; jobId?: string }): AppError {
    // Try to extract structured error information
    if ('type' in error && Object.values(ErrorType).includes((error as Error & Record<'type', unknown>).type as ErrorType)) {
      return error as unknown as AppError;
    }

    // Handle common AWS SDK errors
    if (error.name === 'NoSuchKey') {
      return AppErrorBuilder.notFound('S3 Object', 'key');
    }

    if (error.name === 'ConditionalCheckFailedException') {
      return AppErrorBuilder.conflict('DynamoDB Item', 'Item already exists or condition not met');
    }

    if (error.name === 'ThrottlingException' || error.name === 'TooManyRequestsException') {
      return AppErrorBuilder.rateLimit('AWS API rate limit exceeded');
    }

    if (error.name === 'ServiceUnavailableException') {
      return AppErrorBuilder.serviceUnavailable('AWS Service', error.message);
    }

    // Default to internal error
    return AppErrorBuilder.internal(
      'UNEXPECTED_ERROR',
      error.message || 'An unexpected error occurred',
      error,
      context
    );
  }
}

// Custom error classes for specific use cases
export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = 'JobNotFoundError';
  }
}

export class InvalidJobStatusError extends Error {
  constructor(jobId: string, currentStatus: string, expectedStatus: string) {
    super(`Job ${jobId} has status ${currentStatus}, expected ${expectedStatus}`);
    this.name = 'InvalidJobStatusError';
  }
}

export class PresignedUrlExpiredError extends Error {
  constructor(url: string) {
    super(`Presigned URL has expired: ${url}`);
    this.name = 'PresignedUrlExpiredError';
  }
}