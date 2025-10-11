import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { JobService } from '../services';
import { ErrorType } from '@photoeditor/shared';
import { ErrorHandler } from '../utils/errors';
import { addDeprecationHeadersIfLegacy } from '../utils/deprecation';

const logger = new Logger();
const metrics = new Metrics();
const tracer = new Tracer();

let jobService: JobService;

async function initializeServices(): Promise<void> {
  if (jobService) return;

  const region = process.env.AWS_REGION!;
  const jobsTableName = process.env.JOBS_TABLE_NAME!;

  jobService = new JobService(jobsTableName, region);
}

export const handler = async (
  event: APIGatewayProxyEventV2,
  _context: Context
): Promise<APIGatewayProxyResultV2> => {
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('status-handler');
  if (subsegment) {
    tracer.setSegment(subsegment);
  }

  // Extract correlation identifiers
  const requestId = event.requestContext.requestId;
  const traceparent = event.headers['traceparent'];
  const requestPath = event.rawPath || event.requestContext.http.path;

  try {
    await initializeServices();

    const jobId = event.pathParameters?.jobId;
    if (!jobId) {
      logger.warn('Missing jobId parameter', { requestId });
      const errorResponse = ErrorHandler.createSimpleErrorResponse(
        ErrorType.VALIDATION,
        'MISSING_JOB_ID',
        'Job ID is required',
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

    logger.info('Fetching job status', { requestId, jobId });

    const job = await jobService.getJob(jobId);
    if (!job) {
      logger.warn('Job not found', { requestId, jobId });
      const errorResponse = ErrorHandler.createSimpleErrorResponse(
        ErrorType.NOT_FOUND,
        'JOB_NOT_FOUND',
        `Job with ID ${jobId} not found`,
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

    metrics.addMetric('JobStatusFetched', MetricUnits.Count, 1);

    const response = {
      jobId: job.jobId,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      tempS3Key: job.tempS3Key,
      finalS3Key: job.finalS3Key,
      error: job.error
    };

    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-request-id': requestId
    };
    if (traceparent) {
      headers['traceparent'] = traceparent;
    }

    // Add deprecation headers if using legacy route
    headers = addDeprecationHeadersIfLegacy(requestPath, headers);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };

  } catch (error) {
    logger.error('Error fetching job status', { requestId, error: error as Error });
    metrics.addMetric('JobStatusError', MetricUnits.Count, 1);

    const errorResponse = ErrorHandler.createSimpleErrorResponse(
      ErrorType.INTERNAL_ERROR,
      'UNEXPECTED_ERROR',
      'An unexpected error occurred while fetching job status',
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
