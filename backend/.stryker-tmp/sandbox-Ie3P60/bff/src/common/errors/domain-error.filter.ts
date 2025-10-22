// @ts-nocheck
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { DomainError, mapErrorToHttpStatus } from './error-taxonomy';
import { Logger } from '@aws-lambda-powertools/logger';

/**
 * Global exception filter that converts domain errors to HTTP responses
 * Handles both DomainError and HttpException types
 */
@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger({ serviceName: 'error-filter' });

  catch(exception: Error, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    // Handle DomainError
    if (exception instanceof DomainError) {
      const status = mapErrorToHttpStatus(exception.type);
      const errorResponse = {
        statusCode: status,
        error: exception.type,
        message: exception.message,
        details: exception.details,
        timestamp: new Date().toISOString(),
        path: request.url,
      };

      this.logger.error('Domain error occurred', {
        error: errorResponse,
        cause: exception.cause,
      });

      response.status(status).send(errorResponse);
      return;
    }

    // Handle NestJS HttpException
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      const errorResponse = {
        statusCode: status,
        message: typeof exceptionResponse === 'string' ? exceptionResponse : (exceptionResponse as Record<string, unknown>).message,
        timestamp: new Date().toISOString(),
        path: request.url,
      };

      this.logger.error('HTTP exception occurred', { error: errorResponse });

      response.status(status).send(errorResponse);
      return;
    }

    // Handle unknown errors
    const errorResponse = {
      statusCode: 500,
      error: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    this.logger.error('Unexpected error occurred', {
      error: exception,
      message: exception.message,
      stack: exception.stack,
    });

    response.status(500).send(errorResponse);
  }
}
