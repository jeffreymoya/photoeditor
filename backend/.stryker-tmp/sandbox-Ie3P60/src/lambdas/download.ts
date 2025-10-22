// @ts-nocheck
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import middy from '@middy/core';
import { MetricUnits } from '@aws-lambda-powertools/metrics';
import { serviceInjection, ServiceContext } from '@backend/core';

async function validateAndFetchJob(
  jobId: string | undefined,
  container: ServiceContext['container']
) {
  const { jobService, logger } = container;

  if (!jobId) {
    logger.warn('Missing jobId parameter');
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Job ID required' }) };
  }
  const job = await jobService.getJob(jobId);
  if (!job) {
    logger.warn('Job not found', { jobId });
    return { statusCode: 404, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Job not found' }) };
  }
  if (job.status !== 'COMPLETED') {
    logger.warn('Job not completed', { jobId, status: job.status });
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: `Job is not completed. Current status: ${job.status}` }) };
  }
  if (!job.finalS3Key) {
    logger.error('Final S3 key missing for completed job', { jobId });
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Download not available' }) };
  }
  return { job };
}

const baseHandler = async (
  event: APIGatewayProxyEventV2,
  context: ServiceContext
): Promise<APIGatewayProxyResultV2> => {
  const { container } = context;
  const { s3Service, logger, metrics, tracer } = container;

  if (!s3Service) {
    throw new Error('S3Service not available in container');
  }

  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('download-handler');
  if (subsegment) tracer.setSegment(subsegment);

  try {
    const jobId = event.pathParameters?.jobId;
    logger.info('Processing download request', { jobId });
    const validation = await validateAndFetchJob(jobId, container);
    if ('statusCode' in validation) return validation;
    const { job } = validation;
    const downloadUrl = await s3Service.generatePresignedDownload(s3Service.getFinalBucket(), job.finalS3Key!, 3600);
    metrics.addMetric('DownloadGenerated', MetricUnits.Count, 1);
    logger.info('Download URL generated', { jobId });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        downloadUrl,
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        jobId,
        status: job.status
      })
    };
  } catch (error) {
    logger.error('Error processing download request', { error: error as Error });
    metrics.addMetric('DownloadError', MetricUnits.Count, 1);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Internal server error' }) };
  } finally {
    subsegment?.close();
    if (segment) tracer.setSegment(segment);
  }
};

// Wrap with Middy middleware stack
export const handler = middy(baseHandler)
  .use(serviceInjection({ includeS3Service: true }));
