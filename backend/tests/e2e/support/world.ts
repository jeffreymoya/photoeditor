/**
 * Cucumber World Context
 *
 * Shared state and utilities for E2E test scenarios.
 * Provides adapters, services, and test data management.
 */

import { World, IWorldOptions, setWorldConstructor } from '@cucumber/cucumber';
import { APITestAdapter } from '../adapters/api.adapter';
import { S3TestAdapter } from '../adapters/s3.adapter';
import { SQSTestAdapter } from '../adapters/sqs.adapter';
import { PollingService } from '../services/polling.service';
import { TraceValidatorService } from '../services/trace-validator.service';

export interface E2ETestContext {
  apiAdapter: APITestAdapter;
  s3Adapter: S3TestAdapter;
  sqsAdapter: SQSTestAdapter;
  pollingService: PollingService;
  traceValidator: TraceValidatorService;

  // Test data
  currentJobId?: string;
  currentBatchJobId?: string;
  currentPresignedUrl?: string;
  currentS3Key?: string;
  currentResponse?: any;
  currentTraceparent?: string;

  // Configuration
  apiBaseUrl: string;
  tempBucket: string;
  finalBucket: string;
  dlqUrl: string;
}

export class E2EWorld extends World implements E2ETestContext {
  apiAdapter: APITestAdapter;
  s3Adapter: S3TestAdapter;
  sqsAdapter: SQSTestAdapter;
  pollingService: PollingService;
  traceValidator: TraceValidatorService;

  currentJobId?: string;
  currentBatchJobId?: string;
  currentPresignedUrl?: string;
  currentS3Key?: string;
  currentResponse?: any;
  currentTraceparent?: string;

  apiBaseUrl: string;
  tempBucket: string;
  finalBucket: string;
  dlqUrl: string;

  constructor(options: IWorldOptions) {
    super(options);

    // Load configuration from environment
    this.apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:4566/restapis/dummy/local/_user_request_';
    this.tempBucket = process.env.TEMP_BUCKET_NAME || 'photoeditor-temp-local';
    this.finalBucket = process.env.FINAL_BUCKET_NAME || 'photoeditor-final-local';
    this.dlqUrl = process.env.DLQ_URL || 'http://localhost:4566/000000000000/photoeditor-dlq-local';

    // Initialize adapters
    this.apiAdapter = new APITestAdapter(this.apiBaseUrl);
    this.s3Adapter = new S3TestAdapter();
    this.sqsAdapter = new SQSTestAdapter();

    // Initialize services
    this.pollingService = new PollingService();
    this.traceValidator = new TraceValidatorService();
  }

  /**
   * Reset test state between scenarios
   */
  reset(): void {
    this.currentJobId = undefined;
    this.currentBatchJobId = undefined;
    this.currentPresignedUrl = undefined;
    this.currentS3Key = undefined;
    this.currentResponse = undefined;
    this.currentTraceparent = undefined;
    this.traceValidator.reset();
  }
}

setWorldConstructor(E2EWorld);
