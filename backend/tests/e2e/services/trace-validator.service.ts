/**
 * Trace Validator Service for E2E Tests
 *
 * Validates W3C traceparent propagation and structured logging per STANDARDS.md lines 71-72.
 * Complexity: ≤8, LOC: ≤200 per STANDARDS.md line 37
 */

export interface TraceData {
  correlationId?: string;
  traceId?: string;
  traceparent?: string;
  requestId?: string;
  jobId?: string;
  userId?: string;
}

export class TraceValidatorService {
  private traceLogs: TraceData[] = [];

  /**
   * Extract trace data from log output (CC=3)
   */
  extractTraceData(logOutput: string): TraceData[] {
    const traces: TraceData[] = [];
    const lines = logOutput.split('\n').filter(line => line.trim().startsWith('{'));

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.correlationId || parsed.traceId || parsed.traceparent) {
          traces.push({
            correlationId: parsed.correlationId,
            traceId: parsed.traceId,
            traceparent: parsed.traceparent,
            requestId: parsed.requestId,
            jobId: parsed.jobId,
            userId: parsed.userId
          });
        }
      } catch {
        // Skip invalid JSON
      }
    }

    this.traceLogs.push(...traces);
    return traces;
  }

  /**
   * Generate W3C traceparent header (CC=1)
   */
  generateTraceparent(): string {
    const version = '00';
    const traceId = this.randomHex(32);
    const spanId = this.randomHex(16);
    const flags = '01';
    return `${version}-${traceId}-${spanId}-${flags}`;
  }

  /**
   * Validate traceparent propagation (CC=3)
   */
  validateTracePropagation(originalTraceparent: string, loggedTraceparent?: string): boolean {
    if (!loggedTraceparent) {
      return false;
    }

    const [, originalTraceId] = originalTraceparent.split('-');
    const [, loggedTraceId] = loggedTraceparent.split('-');

    return originalTraceId === loggedTraceId;
  }

  /**
   * Calculate trace coverage percentage (CC=3)
   */
  calculateTraceCoverage(totalRequests: number): number {
    const tracedRequests = this.traceLogs.filter(log => log.correlationId && log.traceId).length;

    if (totalRequests === 0) {
      return 0;
    }

    return (tracedRequests / totalRequests) * 100;
  }

  /**
   * Generate report for evidence (CC=2)
   */
  generateReport(): {
    totalTraces: number;
    traceCoverage: number;
    missingFields: string[];
  } {
    const requiredFields = ['correlationId', 'traceId', 'requestId'];
    const missingFields = new Set<string>();

    for (const trace of this.traceLogs) {
      for (const field of requiredFields) {
        if (!trace[field as keyof TraceData]) {
          missingFields.add(field);
        }
      }
    }

    return {
      totalTraces: this.traceLogs.length,
      traceCoverage: this.calculateTraceCoverage(this.traceLogs.length),
      missingFields: Array.from(missingFields)
    };
  }

  /**
   * Helper to generate random hex (CC=1)
   */
  private randomHex(length: number): string {
    const bytes = Math.ceil(length / 2);
    const hex = Array.from({ length: bytes }, () =>
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
    ).join('');
    return hex.slice(0, length);
  }

  /**
   * Reset collected traces (CC=1)
   */
  reset(): void {
    this.traceLogs = [];
  }
}
