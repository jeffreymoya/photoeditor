import { MetricUnit } from '@aws-lambda-powertools/metrics';
import middy from '@middy/core';
import { SQSEvent, SQSRecord } from 'aws-lambda';

import { serviceInjection, ServiceContext, __resetContainerCache } from '@backend/core';

import { ImageProcessingOrchestrationService, ParsedS3Event } from '../services/imageProcessing.service';
import { logger } from '../utils/logger';
import { withSubsegment, extractCorrelationContextFromSqsRecord } from '../utils/tracing';

async function parseS3EventRecord(
  record: SQSRecord,
  container: ServiceContext['container']
): Promise<ParsedS3Event | null> {
  const { s3Service } = container;

  if (!s3Service) {
    throw new Error('S3Service not available in container');
  }

  const body = JSON.parse(record.body);
  const s3Event = body.Records?.[0]?.s3;

  if (!s3Event) {
    logger.warn('Invalid S3 event format', { body });
    return null;
  }

  const bucketName = s3Event.bucket.name;
  const objectKey = decodeURIComponent(s3Event.object.key.replace(/\+/g, ' '));

  logger.info('Processing S3 upload', { bucketName, objectKey });

  const keyStrategy = s3Service.getKeyStrategy();
  const parsedKey = keyStrategy.parseTempKey(objectKey);

  if (!parsedKey) {
    const error = new Error(`Unable to parse temp key: ${objectKey}`);
    logger.error('Invalid S3 key format', { objectKey, error });
    throw error;
  }

  return {
    bucketName,
    objectKey,
    userId: parsedKey.userId,
    jobId: parsedKey.jobId,
    fileName: parsedKey.fileName
  };
}


async function processS3Event(
  record: SQSRecord,
  container: ServiceContext['container']
): Promise<void> {
  const { jobService, s3Service, notificationService, providerFactory, metrics } = container;

  if (!s3Service || !notificationService || !providerFactory) {
    throw new Error('Required services not available in container');
  }

  const parsedEvent = await parseS3EventRecord(record, container);
  if (!parsedEvent) return;

  const { jobId } = parsedEvent;

  // Extract correlation context for logging
  const correlationContext = extractCorrelationContextFromSqsRecord(record, jobId);
  const contextLogger = logger.child({
    ...(correlationContext.correlationId && { correlationId: correlationContext.correlationId }),
    ...(correlationContext.traceId && { traceId: correlationContext.traceId }),
    requestId: correlationContext.requestId,
    jobId,
    userId: parsedEvent.userId
  });

  try {
    contextLogger.info('Processing S3 event', { bucketName: parsedEvent.bucketName, objectKey: parsedEvent.objectKey });

    // Get job from database
    const job = await jobService.getJob(jobId);
    if (!job) {
      contextLogger.error('Job not found', { error: 'Job not found in database', jobId });
      return;
    }

    // Create and use image processing orchestration service
    const imageProcessingService = new ImageProcessingOrchestrationService(
      jobService,
      s3Service,
      notificationService,
      providerFactory
    );

    // Process the image through the complete pipeline
    await imageProcessingService.processUploadedImage(job, parsedEvent);

    metrics.addMetric('JobProcessed', MetricUnit.Count, 1);
    contextLogger.info('Job processing completed', { jobId });

  } catch (error) {
    contextLogger.error('Error processing job', { error: error as Error, jobId });

    try {
      const failedJob = await jobService.markJobFailed(jobId, (error as Error).message);
      await notificationService.sendJobStatusNotification(failedJob);
    } catch (notifyError) {
      contextLogger.error('Failed to notify job failure', { error: notifyError as Error, jobId });
    }

    metrics.addMetric('JobProcessingError', MetricUnit.Count, 1);
    throw error;
  }
}

const baseHandler = async (
  event: SQSEvent,
  context: ServiceContext
): Promise<void> => {
  const { container } = context;
  const { metrics, tracer } = container;

  return withSubsegment('worker-handler', tracer, async () => {
    try {
      logger.info('Processing SQS messages', { messageCount: event.Records.length });

      for (const record of event.Records) {
        await processS3Event(record, container);
      }

    } catch (error) {
      logger.error('Worker handler error', { error: error as Error });
      metrics.addMetric('WorkerError', MetricUnit.Count, 1);
      throw error;
    }
  });
};

// Wrap with Middy middleware stack
export const handler = middy(baseHandler)
  .use(serviceInjection({
    includeS3Service: true,
    includeNotificationService: true,
    includeProviderFactory: true
  }));

export function __resetForTesting(): void {
  __resetContainerCache();
}
