import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for PhotoEditor API smoke tests
 *
 * Exercises presign → upload → status happy path against LocalStack-backed backend.
 * Anchored to standards/testing-standards.md and standards/cross-cutting.md.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/smoke',

  // Maximum time one test can run for
  timeout: 60 * 1000,

  // Test execution settings
  fullyParallel: false, // Run tests sequentially for deterministic LocalStack state
  forbidOnly: !!process.env.CI, // Fail if test.only is committed
  retries: process.env.CI ? 2 : 0, // Retry on CI only
  workers: 1, // Single worker to avoid LocalStack contention

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/smoke-results.json' }],
    ['junit', { outputFile: 'test-results/smoke-junit.xml' }],
    process.env.CI ? ['github'] : ['list'],
  ],

  // Shared test settings
  use: {
    // Base URL for API requests (LocalStack API Gateway)
    baseURL: process.env.API_BASE_URL || 'http://localhost:4566',

    // Capture trace on first retry and on failure
    trace: 'on-first-retry',

    // Capture screenshots on failure
    screenshot: 'only-on-failure',

    // Include HTTP requests in trace
    video: 'retain-on-failure',

    // Extra HTTP headers (correlation ID for trace propagation)
    extraHTTPHeaders: {
      'x-correlation-id': 'playwright-smoke-test',
    },

    // Timeout for API requests
    actionTimeout: 15 * 1000,
  },

  // Test artifacts output
  outputDir: 'test-results',

  // Projects for different test variants (currently just API smoke)
  projects: [
    {
      name: 'api-smoke',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /.*\.smoke\.spec\.ts/,
    },
  ],

  // LocalStack health check (optional but recommended)
  // globalSetup: require.resolve('./tests/smoke/global-setup.ts'),
  // globalTeardown: require.resolve('./tests/smoke/global-teardown.ts'),
});
