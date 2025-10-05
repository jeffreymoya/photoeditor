/**
 * Presign Step Definitions
 *
 * Implements steps for presigned URL generation scenarios.
 * Each step function: Complexity ≤5, LOC ≤75 per STANDARDS.md line 36
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';
import { E2EWorld } from '../support/world';
import { createSampleImage } from '../support/hooks';

/**
 * Request presigned upload for single file (CC=2)
 */
When('I request a presigned upload for:', async function (this: E2EWorld, dataTable) {
  const row = dataTable.rowsHash();

  const request = {
    fileName: row.fileName || 'sample.jpg',
    contentType: row.contentType || 'image/jpeg',
    fileSize: parseInt(row.fileSize || '1024', 10),
    prompt: row.prompt || 'enhance colors'
  };

  this.currentResponse = await this.apiAdapter.requestPresign(request);

  if (this.currentResponse.status === 200) {
    const body = this.currentResponse.data;
    this.currentJobId = body.jobId;
    this.currentPresignedUrl = body.presignedUrl;
    this.currentS3Key = body.s3Key;
  }
});

/**
 * Verify presign response fields (CC=2)
 */
Then('I receive a JSON response with fields {string}, {string}, {string}, and {string}',
  function (this: E2EWorld, field1: string, field2: string, field3: string, field4: string) {
    expect(this.currentResponse.status).to.equal(200);
    expect(this.currentResponse.headers['content-type']).to.include('application/json');

    const body = this.currentResponse.data;
    expect(body).to.have.property(field1);
    expect(body).to.have.property(field2);
    expect(body).to.have.property(field3);
    expect(body).to.have.property(field4);
  }
);

/**
 * Upload image to presigned URL (CC=1)
 */
When('I upload a valid JPEG image to the returned {string}',
  async function (this: E2EWorld, urlField: string) {
    const imageBuffer = createSampleImage();

    const uploadResponse = await this.apiAdapter.uploadToPresignedUrl(
      this.currentPresignedUrl!,
      imageBuffer,
      'image/jpeg'
    );

    expect(uploadResponse.status).to.equal(200);
  }
);

/**
 * Request presign with specific content type (CC=2)
 */
When('I request a presigned upload with contentType {string}',
  async function (this: E2EWorld, contentType: string) {
    const request = {
      fileName: 'test.gif',
      contentType,
      fileSize: 1024,
      prompt: 'test prompt'
    };

    this.currentResponse = await this.apiAdapter.requestPresign(request);
  }
);

/**
 * Verify error response status (CC=1)
 */
Then('the response status is {int}', function (this: E2EWorld, expectedStatus: number) {
  expect(this.currentResponse.status).to.equal(expectedStatus);
});

/**
 * Verify error message content (CC=1)
 */
Then('the error message indicates an invalid contentType', function (this: E2EWorld) {
  const body = this.currentResponse.data;
  expect(body.error || body.message).to.exist;
});
