/**
 * Test Helper Utilities
 *
 * Common utilities for test files to handle TypeScript strict mode
 * and exactOptionalPropertyTypes compliance.
 */

/**
 * Safely parse API Gateway response body
 * Handles exactOptionalPropertyTypes by checking for undefined
 */
export function parseResponseBody(body: string | undefined): any {
  if (!body) {
    throw new Error('Response body is undefined');
  }
  return JSON.parse(body);
}
