import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Logger } from '@aws-lambda-powertools/logger';
import { DomainError, mapErrorToHttpStatus } from '../common/errors';

/**
 * Global logging interceptor that enriches responses with structured logs
 * Implements observability requirements:
 * - correlationId, traceId, requestId, jobId, userId, function, env, version
 *
 * W3C traceparent propagation
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger: Logger;

  constructor() {
    this.logger = new Logger({
      serviceName: 'bff',
    });
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Extract request metadata
    const method = request.method;
    const url = request.url;
    const startTime = Date.now();

    // Extract tracing headers (W3C traceparent)
    const traceparent = request.headers['traceparent'];
    const traceId = this.extractTraceId(traceparent);
    const requestId = request.headers['x-request-id'] || this.generateId();
    const correlationId = request.headers['x-correlation-id'] || requestId;

    // Extract user context (from JWT authorizer)
    const userId = request.user?.sub || 'anonymous';

    // Extract job context from path or body
    const jobId = request.params?.jobId || request.body?.jobId;

    // Add context to logger (via appendKeys for Powertools Logger v1)
    this.logger.appendKeys({
      correlationId,
      traceId,
      requestId,
      userId,
      function: 'bff-handler',
      env: process.env.NODE_ENV || 'development',
      version: process.env.APP_VERSION || '1.0.0',
    });

    // Log incoming request
    this.logger.info('Incoming request', {
      method,
      url,
      jobId,
    });

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        this.logger.info('Request completed', {
          method,
          url,
          statusCode: response.statusCode,
          duration,
          jobId,
        });

        // Propagate tracing headers to response
        if (traceId) {
          response.setHeader('x-trace-id', traceId);
        }
        response.setHeader('x-request-id', requestId);
        response.setHeader('x-correlation-id', correlationId);
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;

        // Handle domain errors with proper status codes
        if (error instanceof DomainError) {
          const statusCode = mapErrorToHttpStatus(error.type);

          this.logger.error('Request failed with domain error', {
            method,
            url,
            statusCode,
            duration,
            errorType: error.type,
            errorMessage: error.message,
            errorDetails: error.details,
            jobId,
          });

          // Propagate tracing headers even on errors
          if (traceId) {
            response.setHeader('x-trace-id', traceId);
          }
          response.setHeader('x-request-id', requestId);
          response.setHeader('x-correlation-id', correlationId);

          return throwError(() => error);
        }

        // Handle unknown errors
        this.logger.error('Request failed with unexpected error', {
          method,
          url,
          statusCode: 500,
          duration,
          error: error as Error,
          jobId,
        });

        // Propagate tracing headers
        if (traceId) {
          response.setHeader('x-trace-id', traceId);
        }
        response.setHeader('x-request-id', requestId);
        response.setHeader('x-correlation-id', correlationId);

        return throwError(() => error);
      })
    );
  }

  /**
   * Extracts trace ID from W3C traceparent header
   * Format: 00-<trace-id>-<span-id>-<flags>
   */
  private extractTraceId(traceparent?: string): string | undefined {
    if (!traceparent) return undefined;

    const parts = traceparent.split('-');
    if (parts.length >= 2) {
      return parts[1];
    }

    return undefined;
  }

  /**
   * Generates a unique ID for request tracking
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
