import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { JobService, PresignService, S3Service, ConfigService, BootstrapService } from '../services';
import { S3Config, PresignUploadRequest, PresignUploadRequestSchema } from '@photoeditor/shared';

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

  const jobService = new JobService(jobsTableName, region);
  const s3Service = new S3Service(s3Config);
  const configService = new ConfigService(region, projectName, environment);

  presignService = new PresignService(jobService, s3Service);

  // Initialize provider factory
  const bootstrapService = new BootstrapService(configService);
  await bootstrapService.initializeProviders();
}

export const handler = async (
  event: APIGatewayProxyEventV2,
  context: Context
): Promise<APIGatewayProxyResultV2> => {
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('presign-handler');
  tracer.setSegment(subsegment);

  try {
    await initializeServices();

    if (!event.body) {
      logger.warn('Missing request body');
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Request body required' })
      };
    }

    const userId = event.requestContext.authorizer?.claims?.sub || 'anonymous';
    const body = JSON.parse(event.body);

    // Validate request body
    const validatedRequest = PresignUploadRequestSchema.parse(body);

    logger.info('Generating presigned URL', { userId, fileName: validatedRequest.fileName });

    const response = await presignService.generatePresignedUpload(userId, validatedRequest);

    metrics.addMetric('PresignedUrlGenerated', 'Count', 1);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response)
    };

  } catch (error) {
    logger.error('Error generating presigned URL', { error: error as Error });
    metrics.addMetric('PresignedUrlError', 'Count', 1);

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