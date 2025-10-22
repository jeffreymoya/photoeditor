// @ts-nocheck
import {
  ErrorType,
  BaseError,
  ValidationError,
  ProviderError,
  InternalError,
  AppError,
  ERROR_HTTP_STATUS,
  ERROR_JOB_STATUS,
  ApiErrorResponse,
  createErrorResponse
} from '@photoeditor/shared';
import { APIGatewayProxyResultV2 } from 'aws-lambda';
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

  /**
   * Build validation error fields
   */
  private static buildValidationFields(error: AppError): Record<string, unknown> {
    return error.type === ErrorType.VALIDATION && 'fieldErrors' in error
      ? { fieldErrors: error.fieldErrors }
      : {};
  }

  /**
   * Build provider error fields
   */
  private static buildProviderFields(error: AppError): Record<string, unknown> {
    if (error.type !== ErrorType.PROVIDER_ERROR) return {};

    const fields: Record<string, unknown> = {};
    if ('provider' in error) fields.provider = error.provider;
    if ('providerCode' in error) fields.providerCode = error.providerCode;
    if ('retryable' in error) fields.retryable = error.retryable;
    return fields;
  }

  /**
   * Build internal error fields
   */
  private static buildInternalErrorFields(error: AppError): Record<string, unknown> {
    if (error.type !== ErrorType.INTERNAL_ERROR) return {};

    const fields: Record<string, unknown> = {};
    if ('stack' in error && process.env.NODE_ENV !== 'production') {
      fields.stack = error.stack;
    }
    if ('context' in error) fields.context = error.context;
    return fields;
  }

  /**
   * Build error-specific fields based on error type
   */
  private static buildErrorTypeFields(error: AppError): Record<string, unknown> {
    return {
      ...this.buildValidationFields(error),
      ...this.buildProviderFields(error),
      ...this.buildInternalErrorFields(error)
    };
  }

  /**
   * Build response headers with correlation data
   */
  private static buildResponseHeaders(requestId: string, traceparent?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-request-id': requestId
    };

    if (traceparent) {
      headers['traceparent'] = traceparent;
    }

    return headers;
  }

  /**
   * Convert AppError to standardized API Gateway response with RFC 7807 format
   * Includes correlation headers for distributed tracing
   */
  static toStandardApiResponse(
    error: AppError,
    requestId: string,
    traceparent?: string
  ): APIGatewayProxyResultV2 {
    const statusCode = this.getHttpStatusCode(error);
    const typeFields = this.buildErrorTypeFields(error);

    const errorResponse: ApiErrorResponse = createErrorResponse({
      type: error.type,
      code: error.code,
      detail: error.message,
      requestId,
      ...typeFields
    });

    const headers = this.buildResponseHeaders(requestId, traceparent);

    return {
      statusCode,
      headers,
      body: JSON.stringify(errorResponse)
    };
  }

  /**
   * Create a standardized error response for simple errors (missing body, invalid params, etc.)
   */
  static createSimpleErrorResponse(
    type: ErrorType,
    code: string,
    detail: string,
    requestId: string,
    traceparent?: string
  ): APIGatewayProxyResultV2 {
    const statusCode = ERROR_HTTP_STATUS[type];

    const errorResponse: ApiErrorResponse = createErrorResponse({
      type,
      code,
      detail,
      requestId
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-request-id': requestId
    };

    if (traceparent) {
      headers['traceparent'] = traceparent;
    }

    return {
      statusCode,
      headers,
      body: JSON.stringify(errorResponse)
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