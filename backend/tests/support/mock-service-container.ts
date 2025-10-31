import type { MiddlewareObj } from '@middy/core';
import type { ServiceContainer, ServiceContainerConfig, ServiceContext } from '@backend/core';
import type { Logger } from '@aws-lambda-powertools/logger';
import type { Metrics } from '@aws-lambda-powertools/metrics';
import type { Tracer } from '@aws-lambda-powertools/tracer';
import type { JobService, S3Service, PresignService, NotificationService } from '../../src/services';

/**
 * Mirrors the runtime service container and allows backend Lambda tests
 * to inject deterministic, fully-populated collaborators without mocking
 * Middy's middleware contract in every spec.
 */

export type MockLogger = jest.Mocked<Logger>;
export type MockMetrics = jest.Mocked<Metrics>;
export type MockTracer = jest.Mocked<Tracer>;
export type MockJobService = jest.Mocked<JobService>;
export type MockS3Service = jest.Mocked<S3Service>;
export type MockPresignService = jest.Mocked<PresignService>;
export type MockNotificationService = jest.Mocked<NotificationService>;

export interface MockServiceOverrides {
  logger?: MockLogger;
  metrics?: MockMetrics;
  tracer?: MockTracer;
  jobService?: MockJobService;
  s3Service?: MockS3Service;
  presignService?: MockPresignService;
  notificationService?: MockNotificationService;
}

let overrides: MockServiceOverrides = {};
let lastContainer: ServiceContainer | undefined;

const defaultSegment = () => ({
  addNewSubsegment: jest.fn(() => ({ close: jest.fn() })),
});

const createMockLogger = (): MockLogger => ({
  addContext: jest.fn(),
  addPersistentLogAttributes: jest.fn(),
  addPersistentLoggerContext: jest.fn(),
  appendKeys: jest.fn(),
  clearState: jest.fn(),
  createChild: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  removeKeys: jest.fn(),
  resetPersistentLogAttributes: jest.fn(),
  setLogLevel: jest.fn(),
  setNamespace: jest.fn(),
  setPersistentLogAttributes: jest.fn(),
  setPersistentLoggerContext: jest.fn(),
  warn: jest.fn(),
  asLogger: jest.fn().mockReturnThis(),
} as unknown as MockLogger);

const createMockMetrics = (): MockMetrics => ({
  addDimension: jest.fn(),
  addMetric: jest.fn(),
  addMetadata: jest.fn(),
  publishStoredMetrics: jest.fn(),
  setNamespace: jest.fn(),
  setService: jest.fn(),
  captureColdStartMetric: jest.fn(),
  flush: jest.fn(),
} as unknown as MockMetrics);

const createMockTracer = (): MockTracer => {
  const segment = defaultSegment();
  return ({
    addServiceName: jest.fn(),
    captureLambdaHandler: jest.fn(),
    getSegment: jest.fn(() => segment),
    setSegment: jest.fn(),
    putAnnotation: jest.fn(),
    putMetadata: jest.fn(),
    provider: undefined,
  } as unknown as MockTracer);
};

const createMockJobService = (): MockJobService => ({
  createBatchJob: jest.fn(),
  createBatchJobResult: jest.fn(),
  createJob: jest.fn(),
  createJobResult: jest.fn(),
  getBatchJob: jest.fn(),
  getBatchJobResult: jest.fn(),
  getJob: jest.fn(),
  getJobResult: jest.fn(),
  markBatchJobCompleted: jest.fn(),
  markBatchJobFailed: jest.fn(),
  markJobCompleted: jest.fn(),
  markJobCompletedResult: jest.fn(),
  markJobEditing: jest.fn(),
  markJobEditingResult: jest.fn(),
  markJobFailed: jest.fn(),
  markJobFailedResult: jest.fn(),
  markJobProcessing: jest.fn(),
  markJobProcessingResult: jest.fn(),
  retryFailedJob: jest.fn(),
  transitionJobStatus: jest.fn(),
  updateJobStatus: jest.fn(),
  updateJobStatusResult: jest.fn(),
} as unknown as MockJobService);

const createMockS3Service = (): MockS3Service => ({
  generatePresignedDownload: jest.fn(),
  generatePresignedUpload: jest.fn(),
  getFinalBucket: jest.fn(),
  getTempBucket: jest.fn(),
  getRegion: jest.fn(),
} as unknown as MockS3Service);

const createMockPresignService = (): MockPresignService => ({
  generatePresignedUpload: jest.fn(),
  generateBatchPresignedUpload: jest.fn(),
} as unknown as MockPresignService);

const createMockNotificationService = (): MockNotificationService => ({
  publish: jest.fn(),
} as unknown as MockNotificationService);

const createMockServiceContainer = (
  config: ServiceContainerConfig
): ServiceContainer => {
  const container: ServiceContainer = {
    logger: overrides.logger ?? createMockLogger(),
    metrics: overrides.metrics ?? createMockMetrics(),
    tracer: overrides.tracer ?? createMockTracer(),
    jobService: overrides.jobService ?? createMockJobService(),
  };

  if (config.includeS3Service || overrides.s3Service) {
    container.s3Service = overrides.s3Service ?? createMockS3Service();
  }

  if (config.includePresignService || overrides.presignService) {
    container.presignService = overrides.presignService ?? createMockPresignService();
  }

  if (config.includeNotificationService || overrides.notificationService) {
    container.notificationService = overrides.notificationService ?? createMockNotificationService();
  }

  return container;
};

export const mockServiceInjection = (
  config: ServiceContainerConfig = {}
): MiddlewareObj<unknown, unknown, Error, ServiceContext> => {
  return {
    before: async (request) => {
      const container = createMockServiceContainer(config);
      lastContainer = container;
      if (!request.context) {
        request.context = {} as ServiceContext;
      }
      (request.context as ServiceContext).container = container;
    },
  };
};

export const setMockServiceOverrides = (custom: MockServiceOverrides): void => {
  overrides = { ...overrides, ...custom };
};

export const resetMockServiceOverrides = (): void => {
  overrides = {};
  lastContainer = undefined;
};

export const getLastMockServiceContainer = (): ServiceContainer | undefined => lastContainer;

export const createIsolatedJobServiceMock = (): MockJobService => createMockJobService();
export const createIsolatedS3ServiceMock = (): MockS3Service => createMockS3Service();
