/**
 * Worker and Event Wiring Step Definitions
 *
 * Implements steps for S3→SQS→Worker event flow scenarios.
 * Each step function: Complexity ≤5, LOC ≤75 per STANDARDS.md line 36
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';
import { E2EWorld } from '../support/world';
import { createSampleImage } from '../support/hooks';

/**
 * Create job with specific status (CC=2)
 */
Given('a job exists with status {string}', async function (this: E2EWorld, status: string) {
  // Create job via presign
  const request = {
    fileName: 'worker-test.jpg',
    contentType: 'image/jpeg',
    fileSize: 1024,
    prompt: 'worker test prompt'
  };

  const response = await this.apiAdapter.requestPresign(request);
  expect(response.status).to.equal(200);

  this.currentJobId = response.data.jobId;
  this.currentS3Key = response.data.s3Key;

  // Verify status matches
  const statusResponse = await this.apiAdapter.getJobStatus(this.currentJobId);
  expect(statusResponse.data.status).to.equal(status);
});

/**
 * Upload object to S3 temp bucket (CC=1)
 */
Given('I upload an object under the temp prefix for that job',
  async function (this: E2EWorld) {
    const imageBuffer = createSampleImage();

    await this.s3Adapter.uploadContent(
      this.tempBucket,
      this.currentS3Key!,
      imageBuffer,
      'image/jpeg'
    );
  }
);

/**
 * Verify S3 event delivered to SQS (CC=2)
 */
Then('an S3 ObjectCreated event is delivered to the processing SQS queue',
  async function (this: E2EWorld) {
    // Poll for queue to have messages (event may take a few seconds)
    await this.pollingService.pollUntil(
      async () => {
        const queueUrl = process.env.PROCESSING_QUEUE_URL || 'http://localhost:4566/000000000000/photoeditor-processing-local';
        const attrs = await this.sqsAdapter.getQueueAttributes(queueUrl);
        return attrs.approximateMessageCount > 0;
      },
      (hasMessages) => hasMessages === true,
      {
        maxAttempts: 10,
        intervalMs: 1000,
        timeoutMs: 10000
      }
    );
  }
);

/**
 * Verify worker Lambda invoked (CC=1)
 */
Then('the worker Lambda is invoked via SQS event source mapping',
  async function (this: E2EWorld) {
    // Worker invocation is evidenced by job status changing
    // We verify this indirectly through status polling
    await this.pollingService.pollForJobStatus(
      async () => {
        const response = await this.apiAdapter.getJobStatus(this.currentJobId!);
        return response.data;
      },
      'PROCESSING',
      30000
    );
  }
);

/**
 * Setup editing provider error scenario (CC=1)
 */
Given('the editing provider returns an error for a specific image',
  async function (this: E2EWorld) {
    // In LocalStack, we simulate this by using a special prompt that triggers fallback
    const request = {
      fileName: 'error-test.jpg',
      contentType: 'image/jpeg',
      fileSize: 1024,
      prompt: 'TRIGGER_PROVIDER_ERROR' // Special keyword for testing
    };

    const response = await this.apiAdapter.requestPresign(request);
    this.currentJobId = response.data.jobId;
    this.currentS3Key = response.data.s3Key;
  }
);

/**
 * Upload image that triggers error (CC=1)
 */
When('I upload that image to the temp bucket via presigned URL',
  async function (this: E2EWorld) {
    const imageBuffer = createSampleImage();

    const uploadResponse = await this.apiAdapter.uploadToPresignedUrl(
      this.currentResponse?.data?.presignedUrl || (await this.apiAdapter.getJobStatus(this.currentJobId!)).data.presignedUrl,
      imageBuffer,
      'image/jpeg'
    );

    expect(uploadResponse.status).to.equal(200);
  }
);

/**
 * Verify fallback copies original (CC=2)
 */
Then('the worker copies the original image to the final bucket',
  async function (this: E2EWorld) {
    // Wait for job to complete
    await this.pollingService.pollForJobStatus(
      async () => {
        const response = await this.apiAdapter.getJobStatus(this.currentJobId!);
        return response.data;
      },
      'COMPLETED',
      60000
    );

    // Verify final object exists
    const statusResponse = await this.apiAdapter.getJobStatus(this.currentJobId!);
    const finalS3Key = statusResponse.data.finalS3Key;

    const exists = await this.s3Adapter.objectExists(this.finalBucket, finalS3Key);
    expect(exists).to.be.true;
  }
);
