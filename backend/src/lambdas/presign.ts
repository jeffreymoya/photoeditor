import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { JobService, PresignService, S3Service, ConfigService, BootstrapService } from '../services';
import { S3Config, PresignUploadRequestSchema, BatchUploadRequestSchema } from '@photoeditor/shared';

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
  const configService = new ConfigService(region, projectName, environment);

  presignService = new PresignService(jobService, s3Service);

  // Initialize provider factory
  const bootstrapService = new BootstrapService(configService);
  await bootstrapService.initializeProviders();
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

    // For APIGatewayProxyEventV2, we need to get user from JWT claims differently
    interface JWTClaims { sub?: string; [key: string]: unknown; }
    interface JWTAuthorizer { jwt?: { claims?: JWTClaims; }; }
    const userId = ((event.requestContext as { authorizer?: JWTAuthorizer }).authorizer?.jwt?.claims?.sub) || 'anonymous';
    const body = JSON.parse(event.body);

    // Check if this is a batch upload request (has 'files' array) or single upload
    if (Array.isArray(body.files)) {
      // Batch upload
      const validatedRequest = BatchUploadRequestSchema.parse(body);

      logger.info('Generating batch presigned URLs', {
        userId,
        fileCount: validatedRequest.files.length,
        sharedPrompt: validatedRequest.sharedPrompt
      });

      const response = await presignService.generateBatchPresignedUpload(userId, validatedRequest);

      metrics.addMetric('BatchPresignedUrlsGenerated', MetricUnits.Count, 1);
      metrics.addMetric('FilesInBatch', MetricUnits.Count, validatedRequest.files.length);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response)
      };
    } else {
      // Single upload (backward compatibility)
      const validatedRequest = PresignUploadRequestSchema.parse(body);

      logger.info('Generating presigned URL', { userId, fileName: validatedRequest.fileName });

      const response = await presignService.generatePresignedUpload(userId, validatedRequest);

      metrics.addMetric('PresignedUrlGenerated', MetricUnits.Count, 1);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response)
      };
    }

  } catch (error) {
    logger.error('Error generating presigned URL', { error: error as Error });
    metrics.addMetric('PresignedUrlError', MetricUnits.Count, 1);

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  } finally {
    subsegment?.close();
    if (segment) {
      tracer.setSegment(segment);
    }
  }
};
