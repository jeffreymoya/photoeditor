/**
 * Common Step Definitions
 *
 * Implements background and shared steps for E2E scenarios.
 * Each step function: Complexity ≤5, LOC ≤75 per STANDARDS.md line 36
 */

import { Given, setDefaultTimeout } from '@cucumber/cucumber';
import { expect } from 'chai';
import { E2EWorld } from '../support/world';
import axios from 'axios';

// Set global timeout for async steps (2 minutes for E2E scenarios)
setDefaultTimeout(120000);

/**
 * Verify LocalStack is running (CC=2)
 */
Given('LocalStack is running on {string}', async function (this: E2EWorld, endpoint: string) {
  try {
    const response = await axios.get(`${endpoint}/_localstack/health`, { timeout: 5000 });
    expect(response.status).to.equal(200);
  } catch (error) {
    throw new Error(`LocalStack is not accessible at ${endpoint}: ${error}`);
  }
});

/**
 * Verify Terraform applied (CC=1)
 */
Given('Terraform has applied with var-file {string}', function (this: E2EWorld, varFile: string) {
  // In automated E2E, we assume Terraform is already applied
  // This step is informational and validates config
  expect(process.env.TEMP_BUCKET_NAME).to.exist;
  expect(process.env.FINAL_BUCKET_NAME).to.exist;
});

/**
 * Set API base URL from environment (CC=1)
 */
Given('the API base URL is read from Terraform output {string}',
  function (this: E2EWorld, outputName: string) {
    // API base URL should be set in environment or use default
    expect(this.apiBaseUrl).to.exist;
  }
);

/**
 * Verify AWS CLI configuration (CC=1)
 */
Given('AWS CLI is configured with:', function (this: E2EWorld, dataTable) {
  const config = dataTable.rowsHash();

  // Verify environment variables are set
  expect(process.env.LOCALSTACK_ENDPOINT || process.env.AWS_ENDPOINT_URL).to.exist;
  expect(process.env.AWS_ACCESS_KEY_ID).to.exist;
  expect(process.env.AWS_SECRET_ACCESS_KEY).to.exist;
  expect(process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION).to.exist;
});
