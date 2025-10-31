import { MetricUnits } from '@aws-lambda-powertools/metrics';
import middy from '@middy/core';
import { ErrorType } from '@photoeditor/shared';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

import { serviceInjection, ServiceContext } from '@backend/core';

import { ErrorHandler } from '../utils/errors';
import { JobNotFoundError } from '../repositories/job.repository';

async function handleJobStatus(
  jobId: string | undefined,
  requestId: string,
  traceparent: string | undefined,
  container: ServiceContext['container']
) {
  const { jobService, logger, metrics } = container;

  if (!jobId) {
    logger.warn('Missing jobId parameter', { requestId });
    return ErrorHandler.createSimpleErrorResponse(ErrorType.VALIDATION, 'MISSING_JOB_ID', 'Job ID is required', requestId, traceparent);
  }
  logger.info('Fetching job status', { requestId, jobId });

  try {
    const jobResult = await jobService.getJobResult(jobId);
    if (jobResult.isErr()) {
      const { error } = jobResult;
      if (error instanceof JobNotFoundError) {
        logger.warn('Job not found', { requestId, jobId });
        return ErrorHandler.createSimpleErrorResponse(ErrorType.NOT_FOUND, 'JOB_NOT_FOUND', `Job with ID ${jobId} not found`, requestId, traceparent);
      }

      throw error;
    }

    const job = jobResult.value;
    metrics.addMetric('JobStatusFetched', MetricUnits.Count, 1);
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'x-request-id': requestId };
    if (traceparent) headers['traceparent'] = traceparent;
    return { statusCode: 200, headers, body: JSON.stringify({ jobId: job.jobId, status: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt, tempS3Key: job.tempS3Key, finalS3Key: job.finalS3Key, error: job.error }) };
  } catch (error) {
    // Re-throw to be handled by the main error handler
    throw error;
  }
}

async function handleBatchStatus(
  event: APIGatewayProxyEventV2,
  requestId: string,
  traceparent: string | undefined,
  container: ServiceContext['container']
): Promise<APIGatewayProxyResultV2> {
  const { jobService, logger, metrics } = container;
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

  const batchJobResult = await jobService.getBatchJobResult(batchJobId);
  if (batchJobResult.isErr()) {
    const { error } = batchJobResult;
    if (error instanceof JobNotFoundError) {
      logger.warn('Batch job not found', { requestId, batchJobId });
      return ErrorHandler.createSimpleErrorResponse(
        ErrorType.NOT_FOUND,
        'BATCH_JOB_NOT_FOUND',
        `Batch job with ID ${batchJobId} not found`,
        requestId,
        traceparent
      );
    }

    throw error;
  }

  const batchJob = batchJobResult.value;

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

const baseHandler = async (
  event: APIGatewayProxyEventV2,
  context: ServiceContext
): Promise<APIGatewayProxyResultV2> => {
  const { container } = context;
  const { logger, metrics, tracer } = container;

  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('status-handler');
  if (subsegment) tracer.setSegment(subsegment);

  const requestId = event.requestContext.requestId;
  const traceparent = event.headers['traceparent'];
  const path = event.requestContext.http.path;

  try {
    if (path.includes('/batch-status/')) return await handleBatchStatus(event, requestId, traceparent, container);
    return await handleJobStatus(event.pathParameters?.jobId, requestId, traceparent, container);
  } catch (error) {
    logger.error('Error fetching job status', { requestId, error: error as Error });
    metrics.addMetric('JobStatusError', MetricUnits.Count, 1);
    return ErrorHandler.createSimpleErrorResponse(ErrorType.INTERNAL_ERROR, 'UNEXPECTED_ERROR', 'An unexpected error occurred while fetching job status', requestId, traceparent);
  } finally {
    subsegment?.close();
    if (segment) tracer.setSegment(segment);
  }
};

// Wrap with Middy middleware stack
export const handler = middy(baseHandler)
  .use(serviceInjection({})); // Only needs JobService, which is always included
