// @ts-nocheck
import { HttpStatus } from '@nestjs/common';

/**
 * Domain error types that map to HTTP status codes and DynamoDB job statuses
 * Implements error taxonomy per STANDARDS.md line 71
 */
export enum DomainErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  PRECONDITION_FAILED = 'PRECONDITION_FAILED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

/**
 * Domain error with structured information for error handling and logging
 */
export class DomainError extends Error {
  constructor(
    public readonly type: DomainErrorType,
    public override readonly message: string,
    public readonly details?: Record<string, unknown>,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'DomainError';
    Object.setPrototypeOf(this, DomainError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Maps domain errors to HTTP status codes
 * @param errorType Domain error type
 * @returns HTTP status code
 */
export function mapErrorToHttpStatus(errorType: DomainErrorType): HttpStatus {
  const mapping: Record<DomainErrorType, HttpStatus> = {
    [DomainErrorType.VALIDATION_ERROR]: HttpStatus.BAD_REQUEST,
    [DomainErrorType.RESOURCE_NOT_FOUND]: HttpStatus.NOT_FOUND,
    [DomainErrorType.UNAUTHORIZED]: HttpStatus.UNAUTHORIZED,
    [DomainErrorType.FORBIDDEN]: HttpStatus.FORBIDDEN,
    [DomainErrorType.CONFLICT]: HttpStatus.CONFLICT,
    [DomainErrorType.PRECONDITION_FAILED]: HttpStatus.PRECONDITION_FAILED,
    [DomainErrorType.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
    [DomainErrorType.SERVICE_UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
  };

  return mapping[errorType];
}

/**
 * Maps job status to appropriate error type when job is in unexpected state
 * @param status Current job status
 * @returns Domain error type
 */
export function mapJobStatusToError(status: string): DomainErrorType {
  switch (status) {
    case 'QUEUED':
    case 'PROCESSING':
    case 'EDITING':
      return DomainErrorType.PRECONDITION_FAILED;
    case 'FAILED':
      return DomainErrorType.INTERNAL_ERROR;
    default:
      return DomainErrorType.INTERNAL_ERROR;
  }
}
