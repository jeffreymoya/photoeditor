import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { JobService } from '../services';
import { ErrorType } from '@photoeditor/shared';
import { ErrorHandler } from '../utils/errors';

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
  const path = event.requestContext.http.path;

  try {
    await initializeServices();

    // Route to batch status handler if path matches
    if (path.includes('/batch-status/')) {
      return await handleBatchStatus(event, requestId, traceparent);
    }

    // Handle regular job status
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
    return errorResponse;
  } finally {
    subsegment?.close();
    if (segment) {
      tracer.setSegment(segment);
    }
  }
};

async function handleBatchStatus(
  event: APIGatewayProxyEventV2,
  requestId: string,
  traceparent?: string
): Promise<APIGatewayProxyResultV2> {
  const batchJobId = event.pathParameters?.batchJobId;

  if (!batchJobId) {
    logger.warn('Missing batchJobId parameter', { requestId });
    return ErrorHandler.createSimpleErrorResponse(
      ErrorType.VALIDATION,
      'MISSING_BATCH_JOB_ID',
      'Batch Job ID is required',
      requestId,
      traceparent
    );
  }

  logger.info('Fetching batch job status', { requestId, batchJobId });

  const batchJob = await jobService.getBatchJob(batchJobId);
  if (!batchJob) {
    logger.warn('Batch job not found', { requestId, batchJobId });
    return ErrorHandler.createSimpleErrorResponse(
      ErrorType.NOT_FOUND,
      'BATCH_JOB_NOT_FOUND',
      `Batch job with ID ${batchJobId} not found`,
      requestId,
      traceparent
    );
  }

  metrics.addMetric('BatchJobStatusFetched', MetricUnits.Count, 1);

  const response = {
    batchJobId: batchJob.batchJobId,
    userId: batchJob.userId,
    status: batchJob.status,
    createdAt: batchJob.createdAt,
    updatedAt: batchJob.updatedAt,
    sharedPrompt: batchJob.sharedPrompt,
    completedCount: batchJob.completedCount,
    totalCount: batchJob.totalCount,
    childJobIds: batchJob.childJobIds,
    error: batchJob.error
  };

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
