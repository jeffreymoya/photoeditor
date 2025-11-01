import { Job, JobStatus, JobStatusType, CreateJobRequest, BatchJob, CreateBatchJobRequest, APP_CONFIG } from '@photoeditor/shared';
import {
  isValidTransition,
  getNextState,
  isTerminalState,
  isInProgressState,
  JobEvent
} from '@photoeditor/shared/statecharts/jobLifecycle.machine';
import { Result, ok, err } from 'neverthrow';
import { v4 as uuidv4 } from 'uuid';

/**
 * Domain errors - pure, no infrastructure dependencies
 */
export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly currentState: JobStatusType,
    public readonly attemptedEvent: string
  ) {
    super(`Invalid transition: cannot ${attemptedEvent} from state ${currentState}`);
    this.name = 'InvalidStateTransitionError';
  }
}

export class JobValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobValidationError';
  }
}

/**
 * Pure domain functions for job lifecycle management
 * No I/O, no AWS SDK - only business logic
 * Per the Backend Tier standard: domain services ≤200 LOC, complexity ≤15
 */

/**
 * Creates a new job entity with initial state
 * Pure function - no side effects
 */
export function createJobEntity(request: CreateJobRequest): Result<Job, JobValidationError> {
  // Validate request
  if (!request.userId) {
    return err(new JobValidationError('userId is required'));
  }

  const now = new Date().toISOString();
  const expires_at = Math.floor(Date.now() / 1000) + (APP_CONFIG.JOB_TTL_DAYS * 24 * 60 * 60);

  const job: Job = {
    jobId: uuidv4(),
    userId: request.userId,
    status: JobStatus.QUEUED,
    createdAt: now,
    updatedAt: now,
    locale: request.locale || 'en',
    settings: request.settings,
    prompt: request.prompt,
    batchJobId: request.batchJobId,
    expires_at
  };

  return ok(job);
}

/**
 * Creates a new batch job entity
 */
export function createBatchJobEntity(request: CreateBatchJobRequest): Result<BatchJob, JobValidationError> {
  if (!request.userId) {
    return err(new JobValidationError('userId is required'));
  }

  if (!request.sharedPrompt) {
    return err(new JobValidationError('sharedPrompt is required for batch jobs'));
  }

  if (request.fileCount <= 0) {
    return err(new JobValidationError('fileCount must be positive'));
  }

  const now = new Date().toISOString();
  const expires_at = Math.floor(Date.now() / 1000) + (APP_CONFIG.JOB_TTL_DAYS * 24 * 60 * 60);

  const batchJob: BatchJob = {
    batchJobId: uuidv4(),
    userId: request.userId,
    status: JobStatus.QUEUED,
    createdAt: now,
    updatedAt: now,
    sharedPrompt: request.sharedPrompt,
    individualPrompts: request.individualPrompts,
    childJobIds: [],
    completedCount: 0,
    totalCount: request.fileCount,
    locale: request.locale || 'en',
    settings: request.settings,
    expires_at
  };

  return ok(batchJob);
}

/**
 * Validates and transitions job to PROCESSING state
 */
export function transitionToProcessing(
  job: Job,
  tempS3Key: string
): Result<{ status: JobStatusType; updates: Partial<Job> }, InvalidStateTransitionError> {
  const event: JobEvent = { type: 'START_PROCESSING', tempS3Key };

  if (!isValidTransition(job.status, event)) {
    return err(new InvalidStateTransitionError(job.status, 'START_PROCESSING'));
  }

  const nextState = getNextState(job.status, event);
  if (!nextState) {
    return err(new InvalidStateTransitionError(job.status, 'START_PROCESSING'));
  }

  return ok({
    status: nextState,
    updates: {
      tempS3Key,
      updatedAt: new Date().toISOString()
    }
  });
}

/**
 * Validates and transitions job to EDITING state
 */
export function transitionToEditing(
  job: Job
): Result<{ status: JobStatusType; updates: Partial<Job> }, InvalidStateTransitionError> {
  const event: JobEvent = { type: 'START_EDITING' };

  if (!isValidTransition(job.status, event)) {
    return err(new InvalidStateTransitionError(job.status, 'START_EDITING'));
  }

  const nextState = getNextState(job.status, event);
  if (!nextState) {
    return err(new InvalidStateTransitionError(job.status, 'START_EDITING'));
  }

  return ok({
    status: nextState,
    updates: {
      updatedAt: new Date().toISOString()
    }
  });
}

/**
 * Validates and transitions job to COMPLETED state
 */
export function transitionToCompleted(
  job: Job,
  finalS3Key: string
): Result<{ status: JobStatusType; updates: Partial<Job> }, InvalidStateTransitionError> {
  const event: JobEvent = { type: 'COMPLETE', finalS3Key };

  if (!isValidTransition(job.status, event)) {
    return err(new InvalidStateTransitionError(job.status, 'COMPLETE'));
  }

  const nextState = getNextState(job.status, event);
  if (!nextState) {
    return err(new InvalidStateTransitionError(job.status, 'COMPLETE'));
  }

  return ok({
    status: nextState,
    updates: {
      finalS3Key,
      updatedAt: new Date().toISOString()
    }
  });
}

/**
 * Validates and transitions job to FAILED state
 * Can be called from any state
 */
export function transitionToFailed(
  job: Job,
  error: string
): Result<{ status: JobStatusType; updates: Partial<Job> }, InvalidStateTransitionError> {
  const event: JobEvent = { type: 'FAIL', error };

  if (!isValidTransition(job.status, event)) {
    return err(new InvalidStateTransitionError(job.status, 'FAIL'));
  }

  const nextState = getNextState(job.status, event);
  if (!nextState) {
    return err(new InvalidStateTransitionError(job.status, 'FAIL'));
  }

  return ok({
    status: nextState,
    updates: {
      error,
      updatedAt: new Date().toISOString()
    }
  });
}

/**
 * Calculates batch job progress and determines if it should complete
 */
export function calculateBatchProgress(
  batchJob: BatchJob,
  incrementBy: number = 1
): Result<{ status: JobStatusType; completedCount: number }, JobValidationError> {
  const newCompletedCount = batchJob.completedCount + incrementBy;

  if (newCompletedCount > batchJob.totalCount) {
    return err(new JobValidationError('Completed count cannot exceed total count'));
  }

  const status = newCompletedCount >= batchJob.totalCount
    ? JobStatus.COMPLETED
    : batchJob.status;

  return ok({
    status,
    completedCount: newCompletedCount
  });
}

/**
 * Pure predicate: checks if job is in a terminal state
 */
export function isJobTerminal(job: Job): boolean {
  return isTerminalState(job.status);
}

/**
 * Pure predicate: checks if job is in progress
 */
export function isJobInProgress(job: Job): boolean {
  return isInProgressState(job.status);
}

/**
 * Pure predicate: checks if batch job can accept new child jobs
 */
export function canAddChildJob(batchJob: BatchJob): boolean {
  return !isTerminalState(batchJob.status);
}
