import { v4 as uuidv4 } from 'uuid';

import type { TimeProvider, IdProvider } from '../domain/job.domain';

/**
 * System time provider - uses real clock
 * For production use and non-deterministic scenarios
 */
export class SystemTimeProvider implements TimeProvider {
  now(): string {
    return new Date().toISOString();
  }

  nowEpochSeconds(): number {
    return Math.floor(Date.now() / 1000);
  }
}

/**
 * System ID provider - generates real UUIDs
 * For production use and non-deterministic scenarios
 */
export class SystemIdProvider implements IdProvider {
  generateId(): string {
    return uuidv4();
  }
}

/**
 * Fixed time provider - returns predetermined values
 * For testing deterministic behavior
 */
export class FixedTimeProvider implements TimeProvider {
  constructor(
    private readonly isoTime: string,
    private readonly epochSeconds: number
  ) {}

  now(): string {
    return this.isoTime;
  }

  nowEpochSeconds(): number {
    return this.epochSeconds;
  }
}

/**
 * Fixed ID provider - returns predetermined IDs
 * For testing deterministic behavior
 * Note: generateId will cycle through IDs when exhausted to maintain pure behavior
 */
export class FixedIdProvider implements IdProvider {
  private index = 0;

  constructor(private readonly ids: string[]) {
    if (ids.length === 0) {
      throw new Error('FixedIdProvider requires at least one ID');
    }
  }

  generateId(): string {
    const id = this.ids[this.index % this.ids.length];
    this.index++;
    return id;
  }

  reset(): void {
    this.index = 0;
  }
}
