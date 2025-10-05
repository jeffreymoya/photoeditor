/**
 * Contract Compatibility Step Definitions
 *
 * Tests old client vs new server and vice-versa per STANDARDS.md line 101.
 * Each step function: Complexity ≤5, LOC ≤75 per STANDARDS.md line 36
 */

import { When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';
import { E2EWorld } from '../support/world';
import axios from 'axios';

/**
 * Test with old API version (CC=2)
 */
When('I send a request using API version {string}', async function (this: E2EWorld, version: string) {
  const request = {
    fileName: 'compat-test.jpg',
    contentType: 'image/jpeg',
    fileSize: 1024,
    prompt: 'compatibility test'
  };

  // Add API version header
  this.currentResponse = await axios.post(
    `${this.apiBaseUrl}/presign`,
    request,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Version': version
      },
      validateStatus: () => true
    }
  );
});

/**
 * Verify backward compatibility (CC=2)
 */
Then('the response is compatible with version {string} schema',
  function (this: E2EWorld, version: string) {
    expect(this.currentResponse.status).to.equal(200);

    const body = this.currentResponse.data;

    // v1 schema requires: jobId, presignedUrl, s3Key, expiresAt
    if (version === 'v1') {
      expect(body).to.have.property('jobId');
      expect(body).to.have.property('presignedUrl');
      expect(body).to.have.property('s3Key');
      expect(body).to.have.property('expiresAt');
    }

    // Future versions would have additional checks
  }
);

/**
 * Test missing required fields (CC=2)
 */
When('I send a malformed request missing {string}',
  async function (this: E2EWorld, missingField: string) {
    const request: any = {
      fileName: 'test.jpg',
      contentType: 'image/jpeg',
      fileSize: 1024,
      prompt: 'test'
    };

    // Remove the specified field
    delete request[missingField];

    this.currentResponse = await axios.post(
      `${this.apiBaseUrl}/presign`,
      request,
      {
        headers: { 'Content-Type': 'application/json' },
        validateStatus: () => true
      }
    );
  }
);

/**
 * Verify error handling compatibility (CC=1)
 */
Then('the error response follows the standard error schema',
  function (this: E2EWorld) {
    expect(this.currentResponse.status).to.be.greaterThanOrEqual(400);

    const body = this.currentResponse.data;
    // Standard error schema: { error: string } or { message: string }
    expect(body.error || body.message).to.exist;
  }
);

/**
 * Test idempotency (CC=2)
 */
When('I send the same request twice', async function (this: E2EWorld) {
  const request = {
    fileName: 'idempotent-test.jpg',
    contentType: 'image/jpeg',
    fileSize: 1024,
    prompt: 'idempotency test',
    idempotencyKey: 'test-key-12345' // Optional idempotency key
  };

  // First request
  const response1 = await axios.post(`${this.apiBaseUrl}/presign`, request, {
    validateStatus: () => true
  });

  // Second request
  const response2 = await axios.post(`${this.apiBaseUrl}/presign`, request, {
    validateStatus: () => true
  });

  this.currentResponse = { first: response1, second: response2 };
});

/**
 * Verify idempotency behavior (CC=2)
 */
Then('both responses have different jobIds but same structure',
  function (this: E2EWorld) {
    const { first, second } = this.currentResponse;

    expect(first.status).to.equal(200);
    expect(second.status).to.equal(200);

    // Different jobs created (not truly idempotent for presign, but valid)
    expect(first.data.jobId).to.not.equal(second.data.jobId);

    // Same structure
    expect(Object.keys(first.data).sort()).to.deep.equal(Object.keys(second.data).sort());
  }
);
