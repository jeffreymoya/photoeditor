// Error Classification and Types
export enum ErrorType {
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT = 'RATE_LIMIT',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}

export interface BaseError {
  type: ErrorType;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
  userId?: string;
  jobId?: string;
}

export interface ValidationError extends BaseError {
  type: ErrorType.VALIDATION;
  fieldErrors?: Record<string, string[]>;
}

export interface ProviderError extends BaseError {
  type: ErrorType.PROVIDER_ERROR;
  provider: string;
  providerCode?: string;
  retryable: boolean;
}

export interface InternalError extends BaseError {
  type: ErrorType.INTERNAL_ERROR;
  stack?: string;
  context?: Record<string, unknown>;
}

export type AppError = ValidationError | ProviderError | InternalError | BaseError;

// HTTP Status Code Mappings
export const ERROR_HTTP_STATUS: Record<ErrorType, number> = {
  [ErrorType.VALIDATION]: 400,
  [ErrorType.AUTHENTICATION]: 401,
  [ErrorType.AUTHORIZATION]: 403,
  [ErrorType.NOT_FOUND]: 404,
  [ErrorType.CONFLICT]: 409,
  [ErrorType.RATE_LIMIT]: 429,
  [ErrorType.PROVIDER_ERROR]: 502,
  [ErrorType.SERVICE_UNAVAILABLE]: 503,
  [ErrorType.INTERNAL_ERROR]: 500
};

// Job Status Error Mappings
export const ERROR_JOB_STATUS = {
  [ErrorType.VALIDATION]: 'FAILED',
  [ErrorType.PROVIDER_ERROR]: 'FAILED',
  [ErrorType.INTERNAL_ERROR]: 'FAILED',
  [ErrorType.SERVICE_UNAVAILABLE]: 'FAILED'
} as const;