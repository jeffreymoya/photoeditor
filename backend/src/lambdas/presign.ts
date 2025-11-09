import { MetricUnit } from '@aws-lambda-powertools/metrics';
import middy from '@middy/core';
import { PresignUploadRequestSchema, BatchUploadRequestSchema, ErrorType } from '@photoeditor/shared';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

import { serviceInjection, ServiceContext } from '@backend/core';

import { ErrorHandler } from '../utils/errors';
import { withSubsegment, extractCorrelationContextFromApiEvent } from '../utils/tracing';

async function handleBatchUpload(
  body: unknown,
  userId: string,
  requestId: string,
  traceparent: string | undefined,
  container: ServiceContext['container']
): Promise<APIGatewayProxyResultV2> {
  const { presignService, logger, metrics } = container;

  if (!presignService) {
    throw new Error('PresignService not available in container');
  }

  const validationResult = BatchUploadRequestSchema.safeParse(body);
  if (!validationResult.success) {
    logger.warn('Batch upload validation failed', { requestId, errors: validationResult.error.errors });
    return ErrorHandler.createSimpleErrorResponse(
      ErrorType.VALIDATION,
      'INVALID_REQUEST',
      validationResult.error.errors[0]?.message || 'Request validation failed',
      requestId,
      traceparent
    );
  }

  const validatedRequest = validationResult.data;

  logger.info('Generating batch presigned URLs', {
    requestId,
    userId,
    fileCount: validatedRequest.files.length,
    sharedPrompt: validatedRequest.sharedPrompt
  });

  const response = await presignService.generateBatchPresignedUpload(userId, validatedRequest);

  metrics.addMetric('BatchPresignedUrlsGenerated', MetricUnit.Count, 1);
  metrics.addMetric('FilesInBatch', MetricUnit.Count, validatedRequest.files.length);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-request-id': requestId
  };
  if (traceparent) {
    headers['traceparent'] = traceparent;
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(response)
  };
}

async function handleSingleUpload(
  body: unknown,
  userId: string,
  requestId: string,
  traceparent: string | undefined,
  container: ServiceContext['container']
): Promise<APIGatewayProxyResultV2> {
  const { presignService, logger, metrics } = container;

  if (!presignService) {
    throw new Error('PresignService not available in container');
  }

  const validationResult = PresignUploadRequestSchema.safeParse(body);
  if (!validationResult.success) {
    logger.warn('Single upload validation failed', { requestId, errors: validationResult.error.errors });
    return ErrorHandler.createSimpleErrorResponse(
      ErrorType.VALIDATION,
      'INVALID_REQUEST',
      validationResult.error.errors[0]?.message || 'Request validation failed',
      requestId,
      traceparent
    );
  }

  const validatedRequest = validationResult.data;

  logger.info('Generating presigned URL', { requestId, userId, fileName: validatedRequest.fileName });

  const response = await presignService.generatePresignedUpload(userId, validatedRequest);

  metrics.addMetric('PresignedUrlGenerated', MetricUnit.Count, 1);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-request-id': requestId
  };
  if (traceparent) {
    headers['traceparent'] = traceparent;
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(response)
  };
}

interface ParsedRequest {
  body: unknown;
  userId: string;
}

type UploadType = 'batch' | 'single';

/**
 * Parses and validates the request body from API Gateway event
 * Returns parsed body and userId, or an error response if validation fails
 */
function parsePresignRequest(
  event: APIGatewayProxyEventV2,
  requestId: string,
  traceparent: string | undefined,
  logger: ServiceContext['container']['logger']
): { success: true; data: ParsedRequest } | { success: false; response: APIGatewayProxyResultV2 } {
  if (!event.body) {
    logger.warn('Missing request body', { requestId });
    return {
      success: false,
      response: ErrorHandler.createSimpleErrorResponse(
        ErrorType.VALIDATION,
        'MISSING_REQUEST_BODY',
        'Request body is required',
        requestId,
        traceparent
      )
    };
  }

  let body: unknown;
  try {
    body = JSON.parse(event.body);
  } catch {
    logger.warn('Invalid JSON in request body', { requestId });
    return {
      success: false,
      response: ErrorHandler.createSimpleErrorResponse(
        ErrorType.VALIDATION,
        'INVALID_JSON',
        'Request body must be valid JSON',
        requestId,
        traceparent
      )
    };
  }

  interface JWTClaims { sub?: string; [key: string]: unknown; }
  interface JWTAuthorizer { jwt?: { claims?: JWTClaims; }; }
  const userId = ((event.requestContext as { authorizer?: JWTAuthorizer }).authorizer?.jwt?.claims?.sub) || 'anonymous';

  return { success: true, data: { body, userId } };
}

/**
 * Determines whether the request is for batch or single upload
 * Based on presence of 'files' array in request body
 */
function determineUploadType(body: unknown): UploadType {
  const isBatchUpload = typeof body === 'object' && body !== null && Array.isArray((body as { files?: unknown[] }).files);
  return isBatchUpload ? 'batch' : 'single';
}

const baseHandler = async (
  event: APIGatewayProxyEventV2,
  context: ServiceContext
): Promise<APIGatewayProxyResultV2> => {
  const { container } = context;
  const { logger, metrics, tracer } = container;

  return withSubsegment('presign-handler', tracer, async () => {
    const correlationContext = extractCorrelationContextFromApiEvent(event);
    const { requestId, traceparent } = correlationContext;

    try {
      const parseResult = parsePresignRequest(event, requestId, traceparent, logger);
      if (!parseResult.success) {
        return parseResult.response;
      }

      const { body, userId } = parseResult.data;
      const uploadType = determineUploadType(body);

      const response = uploadType === 'batch'
        ? await handleBatchUpload(body, userId, requestId, traceparent, container)
        : await handleSingleUpload(body, userId, requestId, traceparent, container);

      return response;

    } catch (error) {
      logger.error('Error generating presigned URL', { requestId, error: error as Error });
      metrics.addMetric('PresignedUrlError', MetricUnit.Count, 1);

      return ErrorHandler.createSimpleErrorResponse(
        ErrorType.INTERNAL_ERROR,
        'UNEXPECTED_ERROR',
        'An unexpected error occurred while generating presigned URL',
        requestId,
        traceparent
      );
    }
  });
};

// Wrap with Middy middleware stack
export const handler = middy(baseHandler)
  .use(serviceInjection({
    includePresignService: true
  }));
