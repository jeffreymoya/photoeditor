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

// API Error Response Interface (RFC 7807 Problem Details)
export interface ApiErrorResponse {
  code: string;           // Machine-readable error code
  title: string;          // Short, human-readable summary
  detail: string;         // Human-readable explanation specific to this occurrence
  instance: string;       // URI reference identifying the specific occurrence (typically requestId)
  type?: ErrorType;       // ErrorType enum value for client discrimination
  timestamp: string;      // ISO 8601 timestamp
  // Optional fields for additional context
  fieldErrors?: Record<string, string[]>;  // For validation errors
  provider?: string;      // For provider errors
  providerCode?: string;  // For provider errors
  retryable?: boolean;    // For provider errors
  stack?: string;         // For internal errors (dev/staging only)
  context?: Record<string, unknown>; // For additional debug context
}

// Error title mappings for consistency
export const ERROR_TITLES: Record<ErrorType, string> = {
  [ErrorType.VALIDATION]: 'Validation Error',
  [ErrorType.AUTHENTICATION]: 'Authentication Required',
  [ErrorType.AUTHORIZATION]: 'Insufficient Permissions',
  [ErrorType.NOT_FOUND]: 'Resource Not Found',
  [ErrorType.CONFLICT]: 'Conflict',
  [ErrorType.RATE_LIMIT]: 'Rate Limit Exceeded',
  [ErrorType.PROVIDER_ERROR]: 'External Provider Error',
  [ErrorType.SERVICE_UNAVAILABLE]: 'Service Unavailable',
  [ErrorType.INTERNAL_ERROR]: 'Internal Server Error'
};

// Helper function to create standardized error responses
export function createErrorResponse(params: {
  type: ErrorType;
  code: string;
  detail: string;
  requestId: string;
  fieldErrors?: Record<string, string[]>;
  provider?: string;
  providerCode?: string;
  retryable?: boolean;
  stack?: string;
  context?: Record<string, unknown>;
}): ApiErrorResponse {
  return {
    code: params.code,
    title: ERROR_TITLES[params.type],
    detail: params.detail,
    instance: params.requestId,
    type: params.type,
    timestamp: new Date().toISOString(),
    ...(params.fieldErrors && { fieldErrors: params.fieldErrors }),
    ...(params.provider && { provider: params.provider }),
    ...(params.providerCode && { providerCode: params.providerCode }),
    ...(params.retryable !== undefined && { retryable: params.retryable }),
    ...(params.stack && { stack: params.stack }),
    ...(params.context && { context: params.context })
  };
}