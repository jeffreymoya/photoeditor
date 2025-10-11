/**
 * API Deprecation Header Utilities
 *
 * Implements deprecation header support as required by standards/shared-contracts-tier.md
 * for versioned API surface and migration timeline communication.
 *
 * These utilities help communicate API version deprecations to clients via HTTP headers
 * as defined in docs/compatibility/versioning.md.
 */

/**
 * Configuration for API version deprecation
 */
export interface DeprecationConfig {
  /**
   * ISO 8601 date string when the API version will be removed (e.g., "2026-04-06")
   */
  sunsetDate: string;

  /**
   * URL to the migration guide
   */
  migrationGuideUrl: string;

  /**
   * The current (deprecated) API version
   */
  deprecatedVersion: string;

  /**
   * The recommended replacement version
   */
  replacementVersion: string;
}

/**
 * Default deprecation configuration for v1 -> v2 migration
 * Sunset date: 2026-04-06 (6 months from announcement on 2025-10-06)
 */
export const DEFAULT_V1_DEPRECATION: DeprecationConfig = {
  sunsetDate: '2026-04-06',
  migrationGuideUrl: 'https://docs.photoeditor.com/migrations/v1-to-v2',
  deprecatedVersion: 'v1',
  replacementVersion: 'v2'
};

/**
 * Generates deprecation headers for legacy API routes
 *
 * Returns HTTP headers that inform clients about API deprecation:
 * - Deprecation: RFC 8594 deprecation header
 * - Sunset: RFC 8594 sunset date in HTTP date format
 * - Link: Link to migration guide with rel="deprecation"
 * - Warning: Human-readable deprecation warning (RFC 7234)
 *
 * @param config - Deprecation configuration
 * @returns Headers object ready to merge into Lambda response
 *
 * @example
 * ```typescript
 * const headers = {
 *   'Content-Type': 'application/json',
 *   ...getDeprecationHeaders(DEFAULT_V1_DEPRECATION)
 * };
 * ```
 */
export function getDeprecationHeaders(
  config: DeprecationConfig = DEFAULT_V1_DEPRECATION
): Record<string, string> {
  // Convert ISO date to HTTP date format (RFC 7231)
  // Example: "Mon, 06 Apr 2026 00:00:00 GMT"
  const sunsetDate = new Date(config.sunsetDate);
  const httpDate = sunsetDate.toUTCString();

  return {
    // RFC 8594: Deprecation header (boolean)
    'Deprecation': 'true',

    // RFC 8594: Sunset header with HTTP date format
    'Sunset': httpDate,

    // RFC 8288: Link header pointing to migration documentation
    'Link': `<${config.migrationGuideUrl}>; rel="deprecation"`,

    // RFC 7234: Warning header with human-readable message
    // 299 = Miscellaneous persistent warning
    'Warning': `299 - "API version ${config.deprecatedVersion} is deprecated and will be removed on ${config.sunsetDate}. Please migrate to ${config.replacementVersion}."`
  };
}

/**
 * Determines if a request is using a legacy (non-versioned) route
 *
 * @param path - The request path from API Gateway event
 * @returns true if the path does not include a version prefix (e.g., /v1/, /v2/)
 *
 * @example
 * ```typescript
 * isLegacyRoute('/upload/presign') // true (no version)
 * isLegacyRoute('/v1/upload/presign') // false (versioned)
 * isLegacyRoute('/jobs/abc123') // true (no version)
 * isLegacyRoute('/v2/jobs/abc123') // false (versioned)
 * ```
 */
export function isLegacyRoute(path: string): boolean {
  // Legacy routes don't have /v{number}/ prefix
  return !path.match(/^\/v\d+\//);
}

/**
 * Adds deprecation headers to response headers if the request uses a legacy route
 *
 * This is a convenience function that combines route detection and header injection.
 *
 * @param path - The request path from API Gateway event
 * @param existingHeaders - Existing response headers to merge with
 * @param config - Optional deprecation configuration (defaults to V1 deprecation)
 * @returns Updated headers object with deprecation headers if applicable
 *
 * @example
 * ```typescript
 * // In a Lambda handler
 * const headers = addDeprecationHeadersIfLegacy(
 *   event.rawPath,
 *   { 'Content-Type': 'application/json', 'x-request-id': requestId }
 * );
 *
 * return {
 *   statusCode: 200,
 *   headers,
 *   body: JSON.stringify(response)
 * };
 * ```
 */
export function addDeprecationHeadersIfLegacy(
  path: string,
  existingHeaders: Record<string, string>,
  config: DeprecationConfig = DEFAULT_V1_DEPRECATION
): Record<string, string> {
  if (isLegacyRoute(path)) {
    return {
      ...existingHeaders,
      ...getDeprecationHeaders(config)
    };
  }
  return existingHeaders;
}
