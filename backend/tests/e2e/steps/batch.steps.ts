/**
 * Batch Upload Step Definitions
 *
 * Implements steps for batch upload scenarios.
 * Each step function: Complexity ≤5, LOC ≤75 per STANDARDS.md line 36
 */

import { When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';
import { E2EWorld } from '../support/world';
import { createSampleImage } from '../support/hooks';

/**
 * Request batch presigned URLs (CC=2)
 */
When('I request batch presigned uploads for {int} images with a shared prompt',
  async function (this: E2EWorld, fileCount: number) {
    const files = Array.from({ length: fileCount }, (_, i) => ({
      fileName: `batch-image-${i + 1}.jpg`,
      contentType: 'image/jpeg',
      fileSize: 1024
    }));

    const request = {
      files,
      sharedPrompt: 'Batch upload test prompt'
    };

    this.currentResponse = await this.apiAdapter.requestBatchPresign(request);

    if (this.currentResponse.status === 200) {
      const body = this.currentResponse.data;
      this.currentBatchJobId = body.batchJobId;
    }
  }
);

/**
 * Verify batch response structure (CC=2)
 */
Then('I receive a JSON response with fields {string}, {string} \\({int} items), and {string} \\({int} items)',
  function (this: E2EWorld, field1: string, field2: string, count2: number, field3: string, count3: number) {
    expect(this.currentResponse.status).to.equal(200);

    const body = this.currentResponse.data;
    expect(body).to.have.property(field1);
    expect(body).to.have.property(field2);
    expect(body).to.have.property(field3);

    expect(body[field2]).to.be.an('array').with.lengthOf(count2);
    expect(body[field3]).to.be.an('array').with.lengthOf(count3);
  }
);

/**
 * Upload multiple images to presigned URLs (CC=2)
 */
When('I upload both images to their respective presigned URLs',
  async function (this: E2EWorld) {
    const body = this.currentResponse.data;
    const uploads = body.uploads;

    const imageBuffer = createSampleImage();

    for (const upload of uploads) {
      const uploadResponse = await this.apiAdapter.uploadToPresignedUrl(
        upload.presignedUrl,
        imageBuffer,
        'image/jpeg'
      );

      expect(uploadResponse.status).to.equal(200);
    }
  }
);

/**
 * Poll for all child jobs to complete (CC=3)
 */
Then('each child job status becomes {string} within {int} seconds',
  async function (this: E2EWorld, targetStatus: string, timeoutSeconds: number) {
    const body = this.currentResponse.data;
    const childJobIds = body.childJobIds;

    for (const jobId of childJobIds) {
      await this.pollingService.pollForJobStatus(
        async () => {
          const response = await this.apiAdapter.getJobStatus(jobId);
          return response.data;
        },
        targetStatus,
        timeoutSeconds * 1000
      );
    }
  }
);

/**
 * Verify batch job progress (CC=2)
 */
Then('the batch job progress reaches completedCount={int}\\/totalCount={int}',
  async function (this: E2EWorld, completedCount: number, totalCount: number) {
    const batchStatus = await this.apiAdapter.getJobStatus(this.currentBatchJobId!);

    expect(batchStatus.data.completedCount).to.equal(completedCount);
    expect(batchStatus.data.totalCount).to.equal(totalCount);
  }
);

/**
 * Verify batch job status (CC=2)
 */
Then('the batch job status is {string}', async function (this: E2EWorld, expectedStatus: string) {
  const batchStatus = await this.apiAdapter.getJobStatus(this.currentBatchJobId!);
  expect(batchStatus.data.status).to.equal(expectedStatus);
});
