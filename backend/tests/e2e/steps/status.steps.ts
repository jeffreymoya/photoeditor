/**
 * Status Step Definitions
 *
 * Implements steps for job status retrieval scenarios.
 * Each step function: Complexity ≤5, LOC ≤75 per STANDARDS.md line 36
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';
import { E2EWorld } from '../support/world';

/**
 * Create a job and store its ID (CC=2)
 */
Given('a valid existing jobId', async function (this: E2EWorld) {
  // Create a job by requesting presigned URL
  const request = {
    fileName: 'test-status.jpg',
    contentType: 'image/jpeg',
    fileSize: 1024,
    prompt: 'test prompt for status'
  };

  const response = await this.apiAdapter.requestPresign(request);
  expect(response.status).to.equal(200);

  this.currentJobId = response.data.jobId;
});

/**
 * Get job status (CC=1)
 */
When('I GET \\/status\\/{jobId}', async function (this: E2EWorld) {
  this.currentResponse = await this.apiAdapter.getJobStatus(this.currentJobId!);
});

/**
 * Verify JSON response contains fields (CC=2)
 */
Then('the JSON contains {string}, {string}, {string}, and {string}',
  function (this: E2EWorld, field1: string, field2: string, field3: string, field4: string) {
    expect(this.currentResponse.status).to.equal(200);

    const body = this.currentResponse.data;
    expect(body).to.have.property(field1);
    expect(body).to.have.property(field2);
    expect(body).to.have.property(field3);
    expect(body).to.have.property(field4);
  }
);

/**
 * Poll for job status with timeout (CC=3)
 */
Then('the job status becomes {string} within {int} seconds via GET \\/status\\/{jobId}',
  async function (this: E2EWorld, targetStatus: string, timeoutSeconds: number) {
    const result = await this.pollingService.pollForJobStatus(
      async () => {
        const response = await this.apiAdapter.getJobStatus(this.currentJobId!);
        return response.data;
      },
      targetStatus,
      timeoutSeconds * 1000
    );

    expect(result.status).to.equal(targetStatus);
    this.currentResponse = { status: 200, data: result };
  }
);

/**
 * Verify S3 object exists in final bucket (CC=2)
 */
Then('the final object for the job exists in the final S3 bucket',
  async function (this: E2EWorld) {
    // Get the final S3 key from job status
    const statusResponse = await this.apiAdapter.getJobStatus(this.currentJobId!);
    const finalS3Key = statusResponse.data.finalS3Key;

    expect(finalS3Key).to.exist;

    // Check if object exists
    const exists = await this.s3Adapter.objectExists(this.finalBucket, finalS3Key);
    expect(exists).to.be.true;
  }
);

/**
 * Verify DLQ has zero messages (CC=2)
 */
Then('the SQS dead-letter queue has {int} messages', async function (this: E2EWorld, expectedCount: number) {
  const attributes = await this.sqsAdapter.getQueueAttributes(this.dlqUrl);
  expect(attributes.approximateMessageCount).to.equal(expectedCount);
});

/**
 * Verify job status transition to PROCESSING (CC=1)
 */
Then('the job status transitions to {string} and then to {string}',
  async function (this: E2EWorld, status1: string, status2: string) {
    // Poll for first status
    await this.pollingService.pollForJobStatus(
      async () => {
        const response = await this.apiAdapter.getJobStatus(this.currentJobId!);
        return response.data;
      },
      status1,
      30000
    );

    // Poll for second status
    await this.pollingService.pollForJobStatus(
      async () => {
        const response = await this.apiAdapter.getJobStatus(this.currentJobId!);
        return response.data;
      },
      status2,
      120000
    );
  }
);
