/**
 * Test Data Builders for E2E Tests
 *
 * Provides reusable fixture creation per testing-standards.md.
 * Complexity: ≤5, LOC: ≤75 per STANDARDS.md line 36
 */

export interface PresignRequestData {
  fileName?: string;
  contentType?: string;
  fileSize?: number;
  prompt?: string;
}

export interface BatchPresignRequestData {
  fileCount?: number;
  sharedPrompt?: string;
  individualPrompts?: string[];
}

/**
 * Build presign request payload (CC=1)
 */
export function buildPresignRequest(overrides: PresignRequestData = {}): {
  fileName: string;
  contentType: string;
  fileSize: number;
  prompt: string;
} {
  return {
    fileName: overrides.fileName || 'test-image.jpg',
    contentType: overrides.contentType || 'image/jpeg',
    fileSize: overrides.fileSize || 2048,
    prompt: overrides.prompt || 'Enhance colors and improve brightness'
  };
}

/**
 * Build batch presign request payload (CC=2)
 */
export function buildBatchPresignRequest(overrides: BatchPresignRequestData = {}): {
  files: Array<{ fileName: string; contentType: string; fileSize: number }>;
  sharedPrompt?: string;
  individualPrompts?: string[];
} {
  const fileCount = overrides.fileCount || 2;

  const files = Array.from({ length: fileCount }, (_, i) => ({
    fileName: `batch-photo-${i + 1}.jpg`,
    contentType: 'image/jpeg',
    fileSize: 2048
  }));

  const result: any = { files };

  if (overrides.sharedPrompt) {
    result.sharedPrompt = overrides.sharedPrompt;
  }

  if (overrides.individualPrompts) {
    result.individualPrompts = overrides.individualPrompts;
  }

  return result;
}

/**
 * Generate test correlation ID (CC=1)
 */
export function generateTestCorrelationId(): string {
  return `test-corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate test job ID (CC=1)
 */
export function generateTestJobId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
