/**
 * E2E Test Environment Setup
 *
 * Bootstraps LocalStack, Terraform, and mock services for automated E2E tests.
 * Follows bounded polling per testing-standards.md (no sleep-based waits).
 */

import { execSync } from 'child_process';
import axios from 'axios';

/**
 * Wait for LocalStack with bounded retries (CC=3)
 */
export async function waitForLocalStack(maxRetries = 30, delayMs = 1000): Promise<void> {
  console.log('Waiting for LocalStack to be ready...');

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await axios.get('http://localhost:4566/_localstack/health', {
        timeout: 5000
      });

      if (response.status === 200 && response.data.services?.s3 === 'available') {
        console.log('LocalStack is ready');
        return;
      }
    } catch (error) {
      // Retry
    }

    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  throw new Error('LocalStack not ready after maximum retries');
}

/**
 * Setup environment variables for E2E tests (CC=1)
 */
export function setupE2EEnvironment(): void {
  process.env.LOCALSTACK_ENDPOINT = 'http://localhost:4566';
  process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_ACCESS_KEY_ID = 'test';
  process.env.AWS_SECRET_ACCESS_KEY = 'test';
  process.env.AWS_DEFAULT_REGION = 'us-east-1';

  // Set test bucket and table names
  process.env.TEMP_BUCKET_NAME = 'photoeditor-temp-local';
  process.env.FINAL_BUCKET_NAME = 'photoeditor-final-local';
  process.env.JOBS_TABLE_NAME = 'photoeditor-jobs-local';
  process.env.BATCH_TABLE_NAME = 'photoeditor-batch-jobs-local';
  process.env.DLQ_URL = 'http://localhost:4566/000000000000/photoeditor-dlq-local';
  process.env.PROCESSING_QUEUE_URL = 'http://localhost:4566/000000000000/photoeditor-processing-local';

  // API Gateway URL (LocalStack format)
  process.env.API_BASE_URL = 'http://localhost:4566/restapis/dummy/local/_user_request_';

  // Logging
  process.env.LOG_LEVEL = 'error';
  process.env.NODE_ENV = 'test';
  process.env.NO_COLOR = '1';
}

/**
 * Check if LocalStack is running (CC=2)
 */
export async function isLocalStackRunning(): Promise<boolean> {
  try {
    const response = await axios.get('http://localhost:4566/_localstack/health', {
      timeout: 3000
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Start LocalStack if not running (CC=2)
 */
export async function ensureLocalStackRunning(): Promise<void> {
  const running = await isLocalStackRunning();

  if (!running) {
    console.log('Starting LocalStack...');
    execSync('docker compose -f docker-compose.localstack.yml up -d', {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    await waitForLocalStack();
  }
}

/**
 * Deploy Terraform infrastructure (CC=2)
 */
export function deployInfrastructure(): void {
  console.log('Deploying Terraform infrastructure...');

  try {
    // Initialize Terraform (if not already done)
    execSync('terraform init -reconfigure', {
      cwd: 'infrastructure',
      stdio: 'pipe'
    });

    // Apply with LocalStack var file
    execSync('terraform apply -auto-approve -var-file=terraform.tfvars.localstack', {
      cwd: 'infrastructure',
      stdio: 'inherit'
    });

    console.log('Infrastructure deployed successfully');
  } catch (error) {
    console.error('Infrastructure deployment failed:', error);
    throw error;
  }
}

/**
 * Build Lambda functions (CC=1)
 */
export function buildLambdas(): void {
  console.log('Building Lambda functions...');

  execSync('npm run build:lambdas --prefix backend', {
    stdio: 'inherit'
  });

  console.log('Lambda functions built successfully');
}

/**
 * Full E2E environment bootstrap (CC=2)
 */
export async function bootstrapE2EEnvironment(): Promise<void> {
  setupE2EEnvironment();
  await ensureLocalStackRunning();
  buildLambdas();
  deployInfrastructure();

  console.log('E2E environment ready');
}

/**
 * Cleanup E2E environment (CC=1)
 */
export function cleanupE2EEnvironment(): void {
  console.log('Cleaning up E2E environment...');

  try {
    execSync('docker compose -f docker-compose.localstack.yml down', {
      stdio: 'inherit'
    });
  } catch (error) {
    console.warn('Cleanup warning:', error);
  }
}
