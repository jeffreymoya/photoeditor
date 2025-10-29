import { Job, JobStatusType, CreateJobRequest, BatchJob, CreateBatchJobRequest } from '@photoeditor/shared';
import { Result, err } from 'neverthrow';

import { createDynamoDBClient } from '@backend/core';

import {
  createJobEntity,
  createBatchJobEntity,
  transitionToProcessing,
  transitionToEditing,
  transitionToCompleted,
  transitionToFailed,
  calculateBatchProgress,
  isJobTerminal,
  isJobInProgress,
  InvalidStateTransitionError,
  JobValidationError
} from '../domain/job.domain';
import { JobRepository, JobNotFoundError, JobAlreadyExistsError, RepositoryError } from '../repositories/job.repository';

import type { DynamoDBClient } from '@aws-sdk/client-dynamodb';

/**
 * Service-level errors that combine domain and repository errors
 */
export type JobServiceError =
  | JobNotFoundError
  | JobAlreadyExistsError
  | RepositoryError
  | InvalidStateTransitionError
  | JobValidationError;

/**
 * JobService - Application service orchestrating domain and repository
 *
 * Refactored per standards/backend-tier.md:
 * - Domain logic delegated to pure functions in job.domain.ts
 * - I/O delegated to JobRepository
 * - Uses neverthrow Result types for error handling
 * - No thrown exceptions for control flow
 * - State transitions validated via XState machine in shared/statecharts
 */
export class JobService {
  private repository: JobRepository;

  constructor(
    tableName: string,
    region: string,
    batchTableName?: string,
    client?: DynamoDBClient
  ) {
    const dynamoClient = client || createDynamoDBClient(region);
    const batchTable = batchTableName || `${tableName}-batches`;
    this.repository = new JobRepository(dynamoClient, tableName, batchTable);
  }

  /**
   * Creates a new job using domain entity factory - Returns Result
   */
  async createJobResult(request: CreateJobRequest): Promise<Result<Job, JobServiceError>> {
    // Domain: create entity
    const jobResult = createJobEntity(request);
    if (jobResult.isErr()) {
      return jobResult;
    }

    // Repository: persist
    return await this.repository.create(jobResult.value);
  }

  /**
   * Creates a new job - Legacy method that throws on error
   *
   * @deprecated Use createJobResult for proper error handling
   */
  async createJob(request: CreateJobRequest): Promise<Job> {
    const result = await this.createJobResult(request);
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }

  /**
   * Retrieves a job by ID - Returns Result for new code
   */
  async getJobResult(jobId: string): Promise<Result<Job, JobServiceError>> {
    return await this.repository.findById(jobId);
  }

  /**
   * Retrieves a job by ID - Legacy method that returns null on error
   *
   * @deprecated Use getJobResult for proper error handling
   */
  async getJob(jobId: string): Promise<Job | null> {
    const result = await this.repository.findById(jobId);
    return result.isOk() ? result.value : null;
  }

  /**
   * Updates job status with domain validation - Returns Result
   */
  async updateJobStatusResult(
    jobId: string,
    status: JobStatusType,
    updates: Partial<Pick<Job, 'tempS3Key' | 'finalS3Key' | 'error'>> = {}
  ): Promise<Result<Job, JobServiceError>> {
    // Note: Direct status update - for backward compatibility
    // Consider using specific transition methods instead
    const now = new Date().toISOString();
    return await this.repository.updateStatus(jobId, status, {
      ...updates,
      updatedAt: now
    });
  }

  /**
   * Updates job status - Legacy method that throws on error
   *
   * @deprecated Use updateJobStatusResult for proper error handling
   */
  async updateJobStatus(
    jobId: string,
    status: JobStatusType,
    updates: Partial<Pick<Job, 'tempS3Key' | 'finalS3Key' | 'error'>> = {}
  ): Promise<Job> {
    const result = await this.updateJobStatusResult(jobId, status, updates);
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }

  /**
   * Marks job as failed using domain transition validation - Returns Result
   */
  async markJobFailedResult(jobId: string, error: string): Promise<Result<Job, JobServiceError>> {
    // Repository: fetch current state
    const jobResult = await this.repository.findById(jobId);
    if (jobResult.isErr()) {
      return jobResult;
    }

    // Domain: validate transition
    const transitionResult = transitionToFailed(jobResult.value, error);
    if (transitionResult.isErr()) {
      return err(transitionResult.error);
    }

    const { status, updates } = transitionResult.value;

    // Repository: persist
    return await this.repository.updateStatus(jobId, status, updates);
  }

  /**
   * Marks job as failed - Legacy method that throws on error
   *
   * @deprecated Use markJobFailedResult for proper error handling
   */
  async markJobFailed(jobId: string, error: string): Promise<Job> {
    const result = await this.markJobFailedResult(jobId, error);
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }

  /**
   * Marks job as processing using domain transition validation - Returns Result
   */
  async markJobProcessingResult(jobId: string, tempS3Key: string): Promise<Result<Job, JobServiceError>> {
    const jobResult = await this.repository.findById(jobId);
    if (jobResult.isErr()) {
      return jobResult;
    }

    const transitionResult = transitionToProcessing(jobResult.value, tempS3Key);
    if (transitionResult.isErr()) {
      return err(transitionResult.error);
    }

    const { status, updates } = transitionResult.value;
    return await this.repository.updateStatus(jobId, status, updates);
  }

  /**
   * Marks job as processing - Legacy method that throws on error
   *
   * @deprecated Use markJobProcessingResult for proper error handling
   */
  async markJobProcessing(jobId: string, tempS3Key: string): Promise<Job> {
    const result = await this.markJobProcessingResult(jobId, tempS3Key);
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }

  /**
   * Marks job as editing using domain transition validation - Returns Result
   */
  async markJobEditingResult(jobId: string): Promise<Result<Job, JobServiceError>> {
    const jobResult = await this.repository.findById(jobId);
    if (jobResult.isErr()) {
      return jobResult;
    }

    const transitionResult = transitionToEditing(jobResult.value);
    if (transitionResult.isErr()) {
      return err(transitionResult.error);
    }

    const { status, updates } = transitionResult.value;
    return await this.repository.updateStatus(jobId, status, updates);
  }

  /**
   * Marks job as editing - Legacy method that throws on error
   *
   * @deprecated Use markJobEditingResult for proper error handling
   */
  async markJobEditing(jobId: string): Promise<Job> {
    const result = await this.markJobEditingResult(jobId);
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }

  /**
   * Marks job as completed using domain transition validation - Returns Result
   */
  async markJobCompletedResult(jobId: string, finalS3Key: string): Promise<Result<Job, JobServiceError>> {
    const jobResult = await this.repository.findById(jobId);
    if (jobResult.isErr()) {
      return jobResult;
    }

    const transitionResult = transitionToCompleted(jobResult.value, finalS3Key);
    if (transitionResult.isErr()) {
      return err(transitionResult.error);
    }

    const { status, updates } = transitionResult.value;
    return await this.repository.updateStatus(jobId, status, updates);
  }

  /**
   * Marks job as completed - Legacy method that throws on error
   *
   * @deprecated Use markJobCompletedResult for proper error handling
   */
  async markJobCompleted(jobId: string, finalS3Key: string): Promise<Job> {
    const result = await this.markJobCompletedResult(jobId, finalS3Key);
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }

  /**
   * Checks if job is in progress (pure domain logic)
   */
  isJobInProgress(status: JobStatusType): boolean {
    // Temporary adapter for status-only check
    return isJobInProgress({ status } as Job);
  }

  /**
   * Checks if job is terminal (pure domain logic)
   */
  isJobTerminal(status: JobStatusType): boolean {
    // Temporary adapter for status-only check
    return isJobTerminal({ status } as Job);
  }

  // Batch Job Methods

  /**
   * Creates a new batch job using domain entity factory - Returns Result
   */
  async createBatchJobResult(request: CreateBatchJobRequest): Promise<Result<BatchJob, JobServiceError>> {
    const batchJobResult = createBatchJobEntity(request);
    if (batchJobResult.isErr()) {
      return batchJobResult;
    }

    return await this.repository.createBatch(batchJobResult.value);
  }

  /**
   * Creates a new batch job - Legacy method that throws on error
   *
   * @deprecated Use createBatchJobResult for proper error handling
   */
  async createBatchJob(request: CreateBatchJobRequest): Promise<BatchJob> {
    const result = await this.createBatchJobResult(request);
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }

  /**
   * Retrieves a batch job by ID - Returns Result
   */
  async getBatchJobResult(batchJobId: string): Promise<Result<BatchJob, JobServiceError>> {
    return await this.repository.findBatchById(batchJobId);
  }

  /**
   * Retrieves a batch job by ID - Legacy method that returns null on error
   *
   * @deprecated Use getBatchJobResult for proper error handling
   */
  async getBatchJob(batchJobId: string): Promise<BatchJob | null> {
    const result = await this.repository.findBatchById(batchJobId);
    return result.isOk() ? result.value : null;
  }

  /**
   * Updates batch job status - Returns Result
   */
  async updateBatchJobStatusResult(
    batchJobId: string,
    status: JobStatusType,
    updates: Partial<Pick<BatchJob, 'completedCount' | 'error' | 'childJobIds'>> = {}
  ): Promise<Result<BatchJob, JobServiceError>> {
    const now = new Date().toISOString();
    return await this.repository.updateBatchStatus(batchJobId, status, {
      ...updates,
      updatedAt: now
    });
  }

  /**
   * Updates batch job status - Legacy method that throws on error
   *
   * @deprecated Use updateBatchJobStatusResult for proper error handling
   */
  async updateBatchJobStatus(
    batchJobId: string,
    status: JobStatusType,
    updates: Partial<Pick<BatchJob, 'completedCount' | 'error' | 'childJobIds'>> = {}
  ): Promise<BatchJob> {
    const result = await this.updateBatchJobStatusResult(batchJobId, status, updates);
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }

  /**
   * Increments batch job progress using domain calculation - Returns Result
   */
  async incrementBatchJobProgressResult(batchJobId: string): Promise<Result<BatchJob, JobServiceError>> {
    const batchJobResult = await this.repository.findBatchById(batchJobId);
    if (batchJobResult.isErr()) {
      return batchJobResult;
    }

    const progressResult = calculateBatchProgress(batchJobResult.value, 1);
    if (progressResult.isErr()) {
      return err(progressResult.error);
    }

    const { status, completedCount } = progressResult.value;
    return await this.repository.updateBatchStatus(batchJobId, status, {
      completedCount,
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Increments batch job progress - Legacy method that throws on error
   *
   * @deprecated Use incrementBatchJobProgressResult for proper error handling
   */
  async incrementBatchJobProgress(batchJobId: string): Promise<BatchJob> {
    const result = await this.incrementBatchJobProgressResult(batchJobId);
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }

  /**
   * Retrieves all jobs for a batch - Returns Result
   */
  async getJobsByBatchIdResult(batchJobId: string): Promise<Result<Job[], JobServiceError>> {
    return await this.repository.findByBatchId(batchJobId);
  }

  /**
   * Retrieves all jobs for a batch - Legacy method that throws on error
   *
   * @deprecated Use getJobsByBatchIdResult for proper error handling
   */
  async getJobsByBatchId(batchJobId: string): Promise<Job[]> {
    const result = await this.repository.findByBatchId(batchJobId);
    if (result.isErr()) {
      throw result.error;
    }
    return result.value;
  }
}
