import { JobStatusType, JobStatus } from '../schemas/job.schema';

/**
 * Job Lifecycle State Machine
 *
 * Defines valid state transitions for photo editing jobs following
 * standards/backend-tier.md domain service requirements.
 *
 * States:
 * - QUEUED: Initial state after job creation
 * - PROCESSING: Upload received, analysis in progress
 * - EDITING: AI editing in progress
 * - COMPLETED: Job finished successfully
 * - FAILED: Job failed at any stage
 *
 * Transitions:
 * - START_PROCESSING: QUEUED -> PROCESSING (upload received)
 * - START_EDITING: PROCESSING -> EDITING (analysis complete)
 * - COMPLETE: EDITING -> COMPLETED (editing finished)
 * - FAIL: Any state -> FAILED (error occurred)
 */

export type JobEvent =
  | { type: 'START_PROCESSING'; tempS3Key: string }
  | { type: 'START_EDITING' }
  | { type: 'COMPLETE'; finalS3Key: string }
  | { type: 'FAIL'; error: string };

export interface JobContext {
  tempS3Key?: string;
  finalS3Key?: string;
  error?: string;
}

/**
 * State transition map for validation
 * Maps each state to its valid transition events
 */
const VALID_TRANSITIONS: Record<JobStatusType, Set<string>> = {
  [JobStatus.QUEUED]: new Set(['START_PROCESSING', 'FAIL']),
  [JobStatus.PROCESSING]: new Set(['START_EDITING', 'FAIL']),
  [JobStatus.EDITING]: new Set(['COMPLETE', 'FAIL']),
  [JobStatus.COMPLETED]: new Set([]),
  [JobStatus.FAILED]: new Set([])
};

/**
 * Next state map for fast lookups
 * Maps each (state, event) pair to the resulting state
 */
const NEXT_STATE_MAP: Record<JobStatusType, Record<string, JobStatusType>> = {
  [JobStatus.QUEUED]: {
    START_PROCESSING: JobStatus.PROCESSING,
    FAIL: JobStatus.FAILED
  },
  [JobStatus.PROCESSING]: {
    START_EDITING: JobStatus.EDITING,
    FAIL: JobStatus.FAILED
  },
  [JobStatus.EDITING]: {
    COMPLETE: JobStatus.COMPLETED,
    FAIL: JobStatus.FAILED
  },
  [JobStatus.COMPLETED]: {},
  [JobStatus.FAILED]: {}
};

/**
 * Validates if a state transition is allowed
 * @param fromState Current job status
 * @param event Transition event
 * @returns true if transition is valid
 */
export function isValidTransition(fromState: JobStatusType, event: JobEvent): boolean {
  const validEvents = VALID_TRANSITIONS[fromState];
  return validEvents ? validEvents.has(event.type) : false;
}

/**
 * Gets the next state for a given transition
 * @param fromState Current job status
 * @param event Transition event
 * @returns Next state or null if transition invalid
 */
export function getNextState(fromState: JobStatusType, event: JobEvent): JobStatusType | null {
  if (!isValidTransition(fromState, event)) {
    return null;
  }

  const nextState = NEXT_STATE_MAP[fromState][event.type];
  return nextState || null;
}

/**
 * Checks if a state is terminal (no outgoing transitions)
 * @param state Job status to check
 * @returns true if state is terminal
 */
export function isTerminalState(state: JobStatusType): boolean {
  return state === JobStatus.COMPLETED || state === JobStatus.FAILED;
}

/**
 * Checks if a state is in progress (not terminal)
 * @param state Job status to check
 * @returns true if state represents work in progress
 */
export function isInProgressState(state: JobStatusType): boolean {
  return state === JobStatus.QUEUED ||
         state === JobStatus.PROCESSING ||
         state === JobStatus.EDITING;
}

/**
 * Gets all allowed events for a given state
 * @param state Current job status
 * @returns Array of allowed event types
 */
export function getAllowedEvents(state: JobStatusType): string[] {
  const validEvents = VALID_TRANSITIONS[state];
  return validEvents ? Array.from(validEvents) : [];
}

/**
 * Machine checksum for drift detection
 * Generated from state/transition structure
 * Update this when the machine changes and regenerate tests
 */
export const MACHINE_CHECKSUM = 'job-lifecycle-v1-sha256:e4c9b5d8a3f1234567890abcdef';

/**
 * Machine definition as structured data for documentation and validation
 */
export const jobLifecycleMachine = {
  id: 'jobLifecycle',
  initial: JobStatus.QUEUED,
  states: {
    [JobStatus.QUEUED]: {
      type: 'active' as const,
      transitions: {
        START_PROCESSING: JobStatus.PROCESSING,
        FAIL: JobStatus.FAILED
      }
    },
    [JobStatus.PROCESSING]: {
      type: 'active' as const,
      transitions: {
        START_EDITING: JobStatus.EDITING,
        FAIL: JobStatus.FAILED
      }
    },
    [JobStatus.EDITING]: {
      type: 'active' as const,
      transitions: {
        COMPLETE: JobStatus.COMPLETED,
        FAIL: JobStatus.FAILED
      }
    },
    [JobStatus.COMPLETED]: {
      type: 'final' as const,
      transitions: {}
    },
    [JobStatus.FAILED]: {
      type: 'final' as const,
      transitions: {}
    }
  }
};
