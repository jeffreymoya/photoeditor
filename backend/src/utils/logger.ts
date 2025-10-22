import { Logger } from '@aws-lambda-powertools/logger';

export interface LogContext {
  correlationId?: string;
  traceId?: string;
  requestId?: string;
  jobId?: string;
  userId?: string;
  function?: string;
  env?: string;
  version?: string;
  operation?: string;
  timestamp?: string;
  event?: string;
  duration?: number;
  previousStatus?: string;
  newStatus?: string;
  provider?: string;
  success?: boolean;
  [key: string]: unknown;
}

export interface ErrorContext extends LogContext {
  error: Error | string;
  stack?: string;
  statusCode?: number;
  provider?: string;
}

class AppLogger {
  private logger: Logger;

  constructor() {
    const logLevel = process.env.LOG_LEVEL || 'INFO';
    this.logger = new Logger({
      serviceName: 'photo-editor-backend',
      logLevel: logLevel as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR',
      persistentLogAttributes: {
        function: process.env.AWS_LAMBDA_FUNCTION_NAME || 'local',
        env: process.env.NODE_ENV || 'development',
        version: process.env.APP_VERSION || '1.0.0'
      }
    });
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(message, this.formatContext(context));
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(message, this.formatContext(context));
  }

  error(message: string, context?: ErrorContext): void {
    const errorInfo = context?.error
      ? this.extractErrorInfo(context.error)
      : undefined;

    this.logger.error(message, {
      ...this.formatContext(context),
      error: errorInfo
    });
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(message, this.formatContext(context));
  }

  // Structured logging for specific operations
  requestStart(operation: string, context?: LogContext): void {
    this.info(`${operation} started`, {
      ...context,
      operation,
      timestamp: new Date().toISOString(),
      event: 'request_start'
    } as LogContext);
  }

  requestEnd(operation: string, duration: number, context?: LogContext): void {
    this.info(`${operation} completed`, {
      ...context,
      operation,
      duration,
      timestamp: new Date().toISOString(),
      event: 'request_end'
    } as LogContext);
  }

  jobStatusChange(
    jobId: string,
    previousStatus: string,
    newStatus: string,
    context?: LogContext
  ): void {
    this.info('Job status changed', {
      ...context,
      jobId,
      previousStatus,
      newStatus,
      event: 'job_status_change'
    } as LogContext);
  }

  providerCall(
    provider: string,
    operation: string,
    duration: number,
    success: boolean,
    context?: LogContext
  ): void {
    const message = `Provider ${provider} ${operation} ${success ? 'succeeded' : 'failed'}`;
    const logContext = {
      ...context,
      provider,
      operation,
      duration,
      success,
      event: 'provider_call'
    };

    if (success) {
      this.info(message, logContext);
    } else {
      this.error(message, logContext as ErrorContext);
    }
  }

  private formatContext(context?: LogContext): Record<string, unknown> {
    if (!context) return {};

    return Object.entries(context).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, unknown>);
  }

  private extractErrorInfo(error: Error | string): Record<string, unknown> {
    if (typeof error === 'string') {
      return { message: error };
    }

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...('cause' in error && error.cause !== undefined && { cause: error.cause })
    };
  }

  // Create child logger with persistent context
  child(persistentContext: LogContext): AppLogger {
    const childLogger = new AppLogger();
    childLogger.logger = new Logger({
      serviceName: 'photo-editor-backend',
      logLevel: process.env.LOG_LEVEL as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' || 'INFO',
      persistentLogAttributes: {
        function: process.env.AWS_LAMBDA_FUNCTION_NAME || 'local',
        env: process.env.NODE_ENV || 'development',
        version: process.env.APP_VERSION || '1.0.0',
        ...this.formatContext(persistentContext)
      }
    });
    return childLogger;
  }
}

// Export singleton instance
export const logger = new AppLogger();