import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { JobService } from '../services';

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
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('status-handler');
  tracer.setSegment(subsegment);

  try {
    await initializeServices();

    const jobId = event.pathParameters?.jobId;
    if (!jobId) {
      logger.warn('Missing jobId parameter');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Job ID required' })
      };
    }

    logger.info('Fetching job status', { jobId });

    const job = await jobService.getJob(jobId);
    if (!job) {
      logger.warn('Job not found', { jobId });
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Job not found' })
      };
    }

    metrics.addMetric('JobStatusFetched', 'Count', 1);

    const response = {
      jobId: job.jobId,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      tempS3Key: job.tempS3Key,
      finalS3Key: job.finalS3Key,
      error: job.error
    };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response)
    };

  } catch (error) {
    logger.error('Error fetching job status', { error: error as Error });
    metrics.addMetric('JobStatusError', 'Count', 1);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  } finally {
    subsegment?.close();
    tracer.setSegment(segment);
  }
};