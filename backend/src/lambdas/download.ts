import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { JobService, S3Service } from '../services';
import { S3Config } from '@photoeditor/shared';

const logger = new Logger();
const metrics = new Metrics();
const tracer = new Tracer();

let jobService: JobService;
let s3Service: S3Service;

async function initializeServices(): Promise<void> {
  if (jobService) return;

  const region = process.env.AWS_REGION!;
  const tempBucketName = process.env.TEMP_BUCKET_NAME!;
  const finalBucketName = process.env.FINAL_BUCKET_NAME!;
  const jobsTableName = process.env.JOBS_TABLE_NAME!;

  const s3Config: S3Config = {
    region,
    tempBucket: tempBucketName,
    finalBucket: finalBucketName,
    presignExpiration: 3600
  };

  jobService = new JobService(jobsTableName, region);
  s3Service = new S3Service(s3Config);
}

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('download-handler');
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

    logger.info('Processing download request', { jobId });

    const job = await jobService.getJob(jobId);
    if (!job) {
      logger.warn('Job not found', { jobId });
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Job not found' })
      };
    }

    if (job.status !== 'COMPLETED') {
      logger.warn('Job not completed', { jobId, status: job.status });
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Job is not completed. Current status: ${job.status}` })
      };
    }

    if (!job.finalS3Key) {
      logger.error('Final S3 key missing for completed job', { jobId });
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Download not available' })
      };
    }

    // Generate presigned download URL with 1-hour expiration
    const downloadUrl = await s3Service.generatePresignedDownload(
      s3Service.getFinalBucket(),
      job.finalS3Key,
      3600
    );

    metrics.addMetric('DownloadGenerated', 'Count', 1);
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
    metrics.addMetric('DownloadError', 'Count', 1);

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