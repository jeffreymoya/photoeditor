// @ts-nocheck
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import middy from '@middy/core';
import { MetricUnits } from '@aws-lambda-powertools/metrics';
import { PresignUploadRequestSchema, BatchUploadRequestSchema, ErrorType } from '@photoeditor/shared';
import { serviceInjection, ServiceContext } from '@backend/core';
import { ErrorHandler } from '../utils/errors';

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

  metrics.addMetric('BatchPresignedUrlsGenerated', MetricUnits.Count, 1);
  metrics.addMetric('FilesInBatch', MetricUnits.Count, validatedRequest.files.length);

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

  metrics.addMetric('PresignedUrlGenerated', MetricUnits.Count, 1);

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

const baseHandler = async (
  event: APIGatewayProxyEventV2,
  context: ServiceContext
): Promise<APIGatewayProxyResultV2> => {
  const { container } = context;
  const { logger, metrics, tracer } = container;

  // Start manual tracing
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('presign-handler');
  if (subsegment) {
    tracer.setSegment(subsegment);
  }

  // Extract correlation identifiers
  const requestId = event.requestContext.requestId;
  const traceparent = event.headers['traceparent'];

  try {
    if (!event.body) {
      logger.warn('Missing request body', { requestId });
      const errorResponse = ErrorHandler.createSimpleErrorResponse(
        ErrorType.VALIDATION,
        'MISSING_REQUEST_BODY',
        'Request body is required',
        requestId,
        traceparent
      );
      return errorResponse;
    }

    // For APIGatewayProxyEventV2, we need to get user from JWT claims differently
    interface JWTClaims { sub?: string; [key: string]: unknown; }
    interface JWTAuthorizer { jwt?: { claims?: JWTClaims; }; }
    const userId = ((event.requestContext as { authorizer?: JWTAuthorizer }).authorizer?.jwt?.claims?.sub) || 'anonymous';

    let body: unknown;
    try {
      body = JSON.parse(event.body);
    } catch {
      logger.warn('Invalid JSON in request body', { requestId });
      const errorResponse = ErrorHandler.createSimpleErrorResponse(
        ErrorType.VALIDATION,
        'INVALID_JSON',
        'Request body must be valid JSON',
        requestId,
        traceparent
      );
      return errorResponse;
    }

    // Determine if batch or single upload and delegate
    const isBatchUpload = typeof body === 'object' && body !== null && Array.isArray((body as { files?: unknown[] }).files);

    let response: APIGatewayProxyResultV2;
    if (isBatchUpload) {
      response = await handleBatchUpload(body, userId, requestId, traceparent, container);
    } else {
      response = await handleSingleUpload(body, userId, requestId, traceparent, container);
    }

    return response;

  } catch (error) {
    logger.error('Error generating presigned URL', { requestId, error: error as Error });
    metrics.addMetric('PresignedUrlError', MetricUnits.Count, 1);

    const errorResponse = ErrorHandler.createSimpleErrorResponse(
      ErrorType.INTERNAL_ERROR,
      'UNEXPECTED_ERROR',
      'An unexpected error occurred while generating presigned URL',
      requestId,
      traceparent
    );
    return errorResponse;
  } finally {
    subsegment?.close();
    if (segment) {
      tracer.setSegment(segment);
    }
  }
};

// Wrap with Middy middleware stack
export const handler = middy(baseHandler)
  .use(serviceInjection({
    includePresignService: true
  }));
