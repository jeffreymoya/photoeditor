import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { JobService, PresignService, S3Service } from '../services';
import { S3Config, PresignUploadRequestSchema, BatchUploadRequestSchema, ErrorType } from '@photoeditor/shared';
import {
  createSSMClient,
  ConfigService,
  BootstrapService,
  StandardProviderCreator
} from '@backend/core';
import { ErrorHandler } from '../utils/errors';
import { addDeprecationHeadersIfLegacy } from '../utils/deprecation';

const logger = new Logger();
const metrics = new Metrics();
const tracer = new Tracer();

let presignService: PresignService;

async function initializeServices(): Promise<void> {
  if (presignService) return;

  const region = process.env.AWS_REGION!;
  const projectName = process.env.PROJECT_NAME!;
  const environment = process.env.NODE_ENV!;
  const tempBucketName = process.env.TEMP_BUCKET_NAME!;
  const finalBucketName = process.env.FINAL_BUCKET_NAME!;
  const jobsTableName = process.env.JOBS_TABLE_NAME!;

  const s3Config: S3Config = {
    region,
    tempBucket: tempBucketName,
    finalBucket: finalBucketName,
    presignExpiration: 3600
  };

  const batchTableName = process.env.BATCH_TABLE_NAME;
  const jobService = new JobService(jobsTableName, region, batchTableName);
  const s3Service = new S3Service(s3Config);

  presignService = new PresignService(jobService, s3Service);

  // Initialize provider factory (though not used in presign lambda)
  const ssmClient = createSSMClient(region);
  const configService = new ConfigService(ssmClient, projectName, environment);
  const providerCreator = new StandardProviderCreator();
  const bootstrapService = new BootstrapService(configService, providerCreator);
  await bootstrapService.initializeProviders();
}

async function handleBatchUpload(
  body: unknown,
  userId: string,
  requestId: string,
  traceparent?: string
): Promise<APIGatewayProxyResultV2> {
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

  let headers: Record<string, string> = {
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
  traceparent?: string
): Promise<APIGatewayProxyResultV2> {
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

  let headers: Record<string, string> = {
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

export const handler = async (
  event: APIGatewayProxyEventV2,
  _context: Context
): Promise<APIGatewayProxyResultV2> => {
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('presign-handler');
  if (subsegment) {
    tracer.setSegment(subsegment);
  }

  // Extract correlation identifiers
  const requestId = event.requestContext.requestId;
  const traceparent = event.headers['traceparent'];
  const requestPath = event.rawPath || event.requestContext.http.path;

  try {
    await initializeServices();

    if (!event.body) {
      logger.warn('Missing request body', { requestId });
      const errorResponse = ErrorHandler.createSimpleErrorResponse(
        ErrorType.VALIDATION,
        'MISSING_REQUEST_BODY',
        'Request body is required',
        requestId,
        traceparent
      );
      // Add deprecation headers if using legacy route
      errorResponse.headers = addDeprecationHeadersIfLegacy(
        requestPath,
        errorResponse.headers || {}
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
      // Add deprecation headers if using legacy route
      errorResponse.headers = addDeprecationHeadersIfLegacy(
        requestPath,
        errorResponse.headers || {}
      );
      return errorResponse;
    }

    // Determine if batch or single upload and delegate
    const isBatchUpload = typeof body === 'object' && body !== null && Array.isArray((body as { files?: unknown[] }).files);

    let response: APIGatewayProxyResultV2;
    if (isBatchUpload) {
      response = await handleBatchUpload(body, userId, requestId, traceparent);
    } else {
      response = await handleSingleUpload(body, userId, requestId, traceparent);
    }

    // Add deprecation headers if using legacy route
    response.headers = addDeprecationHeadersIfLegacy(
      requestPath,
      response.headers || {}
    );

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
    // Add deprecation headers if using legacy route
    errorResponse.headers = addDeprecationHeadersIfLegacy(
      requestPath,
      errorResponse.headers || {}
    );
    return errorResponse;
  } finally {
    subsegment?.close();
    if (segment) {
      tracer.setSegment(segment);
    }
  }
};
