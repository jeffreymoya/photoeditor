import { MetricUnits } from '@aws-lambda-powertools/metrics';
import middy from '@middy/core';
import { JobStatus, GeminiAnalysisResponse, SeedreamEditingResponse } from '@photoeditor/shared';
import { SQSEvent, SQSRecord } from 'aws-lambda';

import { serviceInjection, ServiceContext, __resetContainerCache } from '@backend/core';

import { logger } from '../utils/logger';

interface ParsedS3Event {
  bucketName: string;
  objectKey: string;
  userId: string;
  jobId: string;
  fileName: string;
}

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

async function processImageAnalysis(
  bucketName: string,
  objectKey: string,
  userPrompt: string,
  container: ServiceContext['container']
) {
  const { s3Service, providerFactory } = container;

  if (!s3Service || !providerFactory) {
    throw new Error('Required services not available in container');
  }

  const optimizedKey = objectKey.replace(/^uploads\//, 'optimized/');
  await s3Service.optimizeAndUploadImage(bucketName, objectKey, bucketName, optimizedKey);

  const analysisProvider = providerFactory.getAnalysisProvider();
  const optimizedUrl = await s3Service.generatePresignedDownload(bucketName, optimizedKey, 300);

  const analysisRequest = { imageUrl: optimizedUrl, prompt: userPrompt };
  const analysisResult = await analysisProvider.analyzeImage(analysisRequest);

  return { optimizedKey, analysisResult };
}

async function processImageEditing(
  optimizedUrl: string,
  optimizedKey: string,
  analysisResult: { success: boolean; data?: unknown },
  userId: string,
  jobId: string,
  fileName: string,
  container: ServiceContext['container']
): Promise<string> {
  const { s3Service, providerFactory } = container;

  if (!s3Service || !providerFactory) {
    throw new Error('Required services not available in container');
  }

  const editingProvider = providerFactory.getEditingProvider();
  const analysisData = analysisResult.success ? analysisResult.data as GeminiAnalysisResponse : null;

  const editingRequest = {
    imageUrl: optimizedUrl,
    analysis: analysisData?.analysis || 'Enhance and improve this image',
    editingInstructions: 'Apply professional photo enhancements based on the analysis'
  };
  const editedImageResult = await editingProvider.editImage(editingRequest);

  const keyStrategy = s3Service.getKeyStrategy();
  const finalKey = keyStrategy.generateFinalKey(userId, jobId, fileName);

  const editedImageData = editedImageResult.success ? editedImageResult.data as SeedreamEditingResponse : null;
  if (editedImageResult.success && editedImageData?.editedImageUrl) {
    const editedImageResponse = await fetch(editedImageData.editedImageUrl);
    const editedImageBuffer = await editedImageResponse.arrayBuffer();

    await s3Service.uploadObject(
      s3Service.getFinalBucket(),
      finalKey,
      Buffer.from(editedImageBuffer),
      'image/jpeg'
    );
  } else {
    await s3Service.copyObject(s3Service.getTempBucket(), optimizedKey, s3Service.getFinalBucket(), finalKey);
  }

  return finalKey;
}

async function handleBatchJobProgress(
  batchJobId: string,
  jobId: string,
  container: ServiceContext['container']
): Promise<void> {
  const { jobService, notificationService } = container;

  if (!notificationService) {
    throw new Error('NotificationService not available in container');
  }

  try {
    const updatedBatchJob = await jobService.incrementBatchJobProgress(batchJobId);
    logger.info('Updated batch job progress', {
      batchJobId,
      completedCount: updatedBatchJob.completedCount,
      totalCount: updatedBatchJob.totalCount,
      isComplete: updatedBatchJob.status === JobStatus.COMPLETED
    });

    if (updatedBatchJob.status === JobStatus.COMPLETED) {
      await notificationService.sendBatchJobCompletionNotification(updatedBatchJob);
    }
  } catch (batchError) {
    logger.error('Failed to update batch job progress', {
      error: batchError as Error,
      batchJobId,
      jobId
    });
  }
}

async function handleJobSuccess(
  jobId: string,
  bucketName: string,
  objectKey: string,
  optimizedKey: string,
  finalKey: string,
  batchJobId: string | undefined,
  container: ServiceContext['container'],
  contextLogger: ReturnType<typeof logger.child>
): Promise<void> {
  const { jobService, s3Service, notificationService, metrics } = container;

  const completedJob = await jobService.markJobCompleted(jobId, finalKey);

  if (batchJobId) {
    await handleBatchJobProgress(batchJobId, jobId, container);
  }

  await notificationService!.sendJobStatusNotification(completedJob);
  await s3Service!.deleteObject(bucketName, objectKey);
  await s3Service!.deleteObject(bucketName, optimizedKey);

  metrics.addMetric('JobProcessed', MetricUnits.Count, 1);
  contextLogger.info('Job processing completed', { jobId });
}

async function handleJobFailure(
  jobId: string,
  error: Error,
  container: ServiceContext['container'],
  contextLogger: ReturnType<typeof logger.child>
): Promise<void> {
  const { jobService, notificationService, metrics } = container;

  contextLogger.error('Error processing job', { error, jobId });

  try {
    const failedJob = await jobService.markJobFailed(jobId, error.message);
    await notificationService!.sendJobStatusNotification(failedJob);
  } catch (notifyError) {
    contextLogger.error('Failed to notify job failure', { error: notifyError as Error, jobId });
  }

  metrics.addMetric('JobProcessingError', MetricUnits.Count, 1);
}

async function processS3Event(
  record: SQSRecord,
  container: ServiceContext['container']
): Promise<void> {
  const { jobService, s3Service, notificationService } = container;

  if (!s3Service || !notificationService) {
    throw new Error('Required services not available in container');
  }

  const parsedEvent = await parseS3EventRecord(record, container);
  if (!parsedEvent) return;

  const { bucketName, objectKey, userId, jobId, fileName } = parsedEvent;

  const traceparent = record.messageAttributes?.traceparent?.stringValue;
  const correlationId = record.messageAttributes?.correlationId?.stringValue || jobId;
  const traceId = traceparent?.split('-')[1];

  const contextLogger = logger.child({
    correlationId,
    ...(traceId && { traceId }),
    requestId: record.messageId,
    jobId,
    userId
  });

  try {
    contextLogger.info('Processing S3 event', { bucketName, objectKey });
    await jobService.markJobProcessing(jobId, objectKey);

    const job = await jobService.getJob(jobId);
    if (!job) {
      contextLogger.error('Job not found', { error: 'Job not found in database', jobId, userId });
      return;
    }

    const userPrompt = job.prompt || 'Analyze this image and provide detailed suggestions for photo editing and enhancement.';

    await jobService.markJobEditing(jobId);
    const { optimizedKey, analysisResult } = await processImageAnalysis(bucketName, objectKey, userPrompt, container);
    const optimizedUrl = await s3Service.generatePresignedDownload(bucketName, optimizedKey, 300);
    const finalKey = await processImageEditing(optimizedUrl, optimizedKey, analysisResult, userId, jobId, fileName, container);

    await handleJobSuccess(jobId, bucketName, objectKey, optimizedKey, finalKey, job.batchJobId, container, contextLogger);

  } catch (error) {
    await handleJobFailure(jobId, error as Error, container, contextLogger);
    throw error;
  }
}

const baseHandler = async (
  event: SQSEvent,
  context: ServiceContext
): Promise<void> => {
  const { container } = context;
  const { metrics, tracer } = container;

  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('worker-handler');
  if (subsegment) {
    tracer.setSegment(subsegment);
  }

  try {
    logger.info('Processing SQS messages', { messageCount: event.Records.length });

    for (const record of event.Records) {
      await processS3Event(record, container);
    }

  } catch (error) {
    logger.error('Worker handler error', { error: error as Error });
    metrics.addMetric('WorkerError', MetricUnits.Count, 1);
    throw error;
  } finally {
    subsegment?.close();
    if (segment) {
      tracer.setSegment(segment);
    }
  }
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
