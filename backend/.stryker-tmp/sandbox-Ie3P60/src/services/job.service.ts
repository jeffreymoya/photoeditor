// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { Result, err } from 'neverthrow';
import { Job, JobStatusType, CreateJobRequest, BatchJob, CreateBatchJobRequest } from '@photoeditor/shared';
import { createDynamoDBClient } from '@backend/core';
import { JobRepository, JobNotFoundError, JobAlreadyExistsError, RepositoryError } from '../repositories/job.repository';
import { createJobEntity, createBatchJobEntity, transitionToProcessing, transitionToEditing, transitionToCompleted, transitionToFailed, calculateBatchProgress, isJobTerminal, isJobInProgress, InvalidStateTransitionError, JobValidationError } from '../domain/job.domain';

/**
 * Service-level errors that combine domain and repository errors
 */
export type JobServiceError = JobNotFoundError | JobAlreadyExistsError | RepositoryError | InvalidStateTransitionError | JobValidationError;

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
  constructor(tableName: string, region: string, batchTableName?: string, client?: DynamoDBClient) {
    if (stryMutAct_9fa48("360")) {
      {}
    } else {
      stryCov_9fa48("360");
      const dynamoClient = stryMutAct_9fa48("363") ? client && createDynamoDBClient(region) : stryMutAct_9fa48("362") ? false : stryMutAct_9fa48("361") ? true : (stryCov_9fa48("361", "362", "363"), client || createDynamoDBClient(region));
      const batchTable = stryMutAct_9fa48("366") ? batchTableName && `${tableName}-batches` : stryMutAct_9fa48("365") ? false : stryMutAct_9fa48("364") ? true : (stryCov_9fa48("364", "365", "366"), batchTableName || (stryMutAct_9fa48("367") ? `` : (stryCov_9fa48("367"), `${tableName}-batches`)));
      this.repository = new JobRepository(dynamoClient, tableName, batchTable);
    }
  }

  /**
   * Creates a new job using domain entity factory - Returns Result
   */
  async createJobResult(request: CreateJobRequest): Promise<Result<Job, JobServiceError>> {
    if (stryMutAct_9fa48("368")) {
      {}
    } else {
      stryCov_9fa48("368");
      // Domain: create entity
      const jobResult = createJobEntity(request);
      if (stryMutAct_9fa48("370") ? false : stryMutAct_9fa48("369") ? true : (stryCov_9fa48("369", "370"), jobResult.isErr())) {
        if (stryMutAct_9fa48("371")) {
          {}
        } else {
          stryCov_9fa48("371");
          return jobResult;
        }
      }

      // Repository: persist
      return await this.repository.create(jobResult.value);
    }
  }

  /**
   * Creates a new job - Legacy method that throws on error
   * @deprecated Use createJobResult for proper error handling
   */
  async createJob(request: CreateJobRequest): Promise<Job> {
    if (stryMutAct_9fa48("372")) {
      {}
    } else {
      stryCov_9fa48("372");
      const result = await this.createJobResult(request);
      if (stryMutAct_9fa48("374") ? false : stryMutAct_9fa48("373") ? true : (stryCov_9fa48("373", "374"), result.isErr())) {
        if (stryMutAct_9fa48("375")) {
          {}
        } else {
          stryCov_9fa48("375");
          throw result.error;
        }
      }
      return result.value;
    }
  }

  /**
   * Retrieves a job by ID - Returns Result for new code
   */
  async getJobResult(jobId: string): Promise<Result<Job, JobServiceError>> {
    if (stryMutAct_9fa48("376")) {
      {}
    } else {
      stryCov_9fa48("376");
      return await this.repository.findById(jobId);
    }
  }

  /**
   * Retrieves a job by ID - Legacy method that returns null on error
   * @deprecated Use getJobResult for proper error handling
   */
  async getJob(jobId: string): Promise<Job | null> {
    if (stryMutAct_9fa48("377")) {
      {}
    } else {
      stryCov_9fa48("377");
      const result = await this.repository.findById(jobId);
      return result.isOk() ? result.value : null;
    }
  }

  /**
   * Updates job status with domain validation - Returns Result
   */
  async updateJobStatusResult(jobId: string, status: JobStatusType, updates: Partial<Pick<Job, 'tempS3Key' | 'finalS3Key' | 'error'>> = {}): Promise<Result<Job, JobServiceError>> {
    if (stryMutAct_9fa48("378")) {
      {}
    } else {
      stryCov_9fa48("378");
      // Note: Direct status update - for backward compatibility
      // Consider using specific transition methods instead
      const now = new Date().toISOString();
      return await this.repository.updateStatus(jobId, status, stryMutAct_9fa48("379") ? {} : (stryCov_9fa48("379"), {
        ...updates,
        updatedAt: now
      }));
    }
  }

  /**
   * Updates job status - Legacy method that throws on error
   * @deprecated Use updateJobStatusResult for proper error handling
   */
  async updateJobStatus(jobId: string, status: JobStatusType, updates: Partial<Pick<Job, 'tempS3Key' | 'finalS3Key' | 'error'>> = {}): Promise<Job> {
    if (stryMutAct_9fa48("380")) {
      {}
    } else {
      stryCov_9fa48("380");
      const result = await this.updateJobStatusResult(jobId, status, updates);
      if (stryMutAct_9fa48("382") ? false : stryMutAct_9fa48("381") ? true : (stryCov_9fa48("381", "382"), result.isErr())) {
        if (stryMutAct_9fa48("383")) {
          {}
        } else {
          stryCov_9fa48("383");
          throw result.error;
        }
      }
      return result.value;
    }
  }

  /**
   * Marks job as failed using domain transition validation - Returns Result
   */
  async markJobFailedResult(jobId: string, error: string): Promise<Result<Job, JobServiceError>> {
    if (stryMutAct_9fa48("384")) {
      {}
    } else {
      stryCov_9fa48("384");
      // Repository: fetch current state
      const jobResult = await this.repository.findById(jobId);
      if (stryMutAct_9fa48("386") ? false : stryMutAct_9fa48("385") ? true : (stryCov_9fa48("385", "386"), jobResult.isErr())) {
        if (stryMutAct_9fa48("387")) {
          {}
        } else {
          stryCov_9fa48("387");
          return jobResult;
        }
      }

      // Domain: validate transition
      const transitionResult = transitionToFailed(jobResult.value, error);
      if (stryMutAct_9fa48("389") ? false : stryMutAct_9fa48("388") ? true : (stryCov_9fa48("388", "389"), transitionResult.isErr())) {
        if (stryMutAct_9fa48("390")) {
          {}
        } else {
          stryCov_9fa48("390");
          return err(transitionResult.error);
        }
      }
      const {
        status,
        updates
      } = transitionResult.value;

      // Repository: persist
      return await this.repository.updateStatus(jobId, status, updates);
    }
  }

  /**
   * Marks job as failed - Legacy method that throws on error
   * @deprecated Use markJobFailedResult for proper error handling
   */
  async markJobFailed(jobId: string, error: string): Promise<Job> {
    if (stryMutAct_9fa48("391")) {
      {}
    } else {
      stryCov_9fa48("391");
      const result = await this.markJobFailedResult(jobId, error);
      if (stryMutAct_9fa48("393") ? false : stryMutAct_9fa48("392") ? true : (stryCov_9fa48("392", "393"), result.isErr())) {
        if (stryMutAct_9fa48("394")) {
          {}
        } else {
          stryCov_9fa48("394");
          throw result.error;
        }
      }
      return result.value;
    }
  }

  /**
   * Marks job as processing using domain transition validation - Returns Result
   */
  async markJobProcessingResult(jobId: string, tempS3Key: string): Promise<Result<Job, JobServiceError>> {
    if (stryMutAct_9fa48("395")) {
      {}
    } else {
      stryCov_9fa48("395");
      const jobResult = await this.repository.findById(jobId);
      if (stryMutAct_9fa48("397") ? false : stryMutAct_9fa48("396") ? true : (stryCov_9fa48("396", "397"), jobResult.isErr())) {
        if (stryMutAct_9fa48("398")) {
          {}
        } else {
          stryCov_9fa48("398");
          return jobResult;
        }
      }
      const transitionResult = transitionToProcessing(jobResult.value, tempS3Key);
      if (stryMutAct_9fa48("400") ? false : stryMutAct_9fa48("399") ? true : (stryCov_9fa48("399", "400"), transitionResult.isErr())) {
        if (stryMutAct_9fa48("401")) {
          {}
        } else {
          stryCov_9fa48("401");
          return err(transitionResult.error);
        }
      }
      const {
        status,
        updates
      } = transitionResult.value;
      return await this.repository.updateStatus(jobId, status, updates);
    }
  }

  /**
   * Marks job as processing - Legacy method that throws on error
   * @deprecated Use markJobProcessingResult for proper error handling
   */
  async markJobProcessing(jobId: string, tempS3Key: string): Promise<Job> {
    if (stryMutAct_9fa48("402")) {
      {}
    } else {
      stryCov_9fa48("402");
      const result = await this.markJobProcessingResult(jobId, tempS3Key);
      if (stryMutAct_9fa48("404") ? false : stryMutAct_9fa48("403") ? true : (stryCov_9fa48("403", "404"), result.isErr())) {
        if (stryMutAct_9fa48("405")) {
          {}
        } else {
          stryCov_9fa48("405");
          throw result.error;
        }
      }
      return result.value;
    }
  }

  /**
   * Marks job as editing using domain transition validation - Returns Result
   */
  async markJobEditingResult(jobId: string): Promise<Result<Job, JobServiceError>> {
    if (stryMutAct_9fa48("406")) {
      {}
    } else {
      stryCov_9fa48("406");
      const jobResult = await this.repository.findById(jobId);
      if (stryMutAct_9fa48("408") ? false : stryMutAct_9fa48("407") ? true : (stryCov_9fa48("407", "408"), jobResult.isErr())) {
        if (stryMutAct_9fa48("409")) {
          {}
        } else {
          stryCov_9fa48("409");
          return jobResult;
        }
      }
      const transitionResult = transitionToEditing(jobResult.value);
      if (stryMutAct_9fa48("411") ? false : stryMutAct_9fa48("410") ? true : (stryCov_9fa48("410", "411"), transitionResult.isErr())) {
        if (stryMutAct_9fa48("412")) {
          {}
        } else {
          stryCov_9fa48("412");
          return err(transitionResult.error);
        }
      }
      const {
        status,
        updates
      } = transitionResult.value;
      return await this.repository.updateStatus(jobId, status, updates);
    }
  }

  /**
   * Marks job as editing - Legacy method that throws on error
   * @deprecated Use markJobEditingResult for proper error handling
   */
  async markJobEditing(jobId: string): Promise<Job> {
    if (stryMutAct_9fa48("413")) {
      {}
    } else {
      stryCov_9fa48("413");
      const result = await this.markJobEditingResult(jobId);
      if (stryMutAct_9fa48("415") ? false : stryMutAct_9fa48("414") ? true : (stryCov_9fa48("414", "415"), result.isErr())) {
        if (stryMutAct_9fa48("416")) {
          {}
        } else {
          stryCov_9fa48("416");
          throw result.error;
        }
      }
      return result.value;
    }
  }

  /**
   * Marks job as completed using domain transition validation - Returns Result
   */
  async markJobCompletedResult(jobId: string, finalS3Key: string): Promise<Result<Job, JobServiceError>> {
    if (stryMutAct_9fa48("417")) {
      {}
    } else {
      stryCov_9fa48("417");
      const jobResult = await this.repository.findById(jobId);
      if (stryMutAct_9fa48("419") ? false : stryMutAct_9fa48("418") ? true : (stryCov_9fa48("418", "419"), jobResult.isErr())) {
        if (stryMutAct_9fa48("420")) {
          {}
        } else {
          stryCov_9fa48("420");
          return jobResult;
        }
      }
      const transitionResult = transitionToCompleted(jobResult.value, finalS3Key);
      if (stryMutAct_9fa48("422") ? false : stryMutAct_9fa48("421") ? true : (stryCov_9fa48("421", "422"), transitionResult.isErr())) {
        if (stryMutAct_9fa48("423")) {
          {}
        } else {
          stryCov_9fa48("423");
          return err(transitionResult.error);
        }
      }
      const {
        status,
        updates
      } = transitionResult.value;
      return await this.repository.updateStatus(jobId, status, updates);
    }
  }

  /**
   * Marks job as completed - Legacy method that throws on error
   * @deprecated Use markJobCompletedResult for proper error handling
   */
  async markJobCompleted(jobId: string, finalS3Key: string): Promise<Job> {
    if (stryMutAct_9fa48("424")) {
      {}
    } else {
      stryCov_9fa48("424");
      const result = await this.markJobCompletedResult(jobId, finalS3Key);
      if (stryMutAct_9fa48("426") ? false : stryMutAct_9fa48("425") ? true : (stryCov_9fa48("425", "426"), result.isErr())) {
        if (stryMutAct_9fa48("427")) {
          {}
        } else {
          stryCov_9fa48("427");
          throw result.error;
        }
      }
      return result.value;
    }
  }

  /**
   * Checks if job is in progress (pure domain logic)
   */
  isJobInProgress(status: JobStatusType): boolean {
    if (stryMutAct_9fa48("428")) {
      {}
    } else {
      stryCov_9fa48("428");
      // Temporary adapter for status-only check
      return isJobInProgress({
        status
      } as Job);
    }
  }

  /**
   * Checks if job is terminal (pure domain logic)
   */
  isJobTerminal(status: JobStatusType): boolean {
    if (stryMutAct_9fa48("429")) {
      {}
    } else {
      stryCov_9fa48("429");
      // Temporary adapter for status-only check
      return isJobTerminal({
        status
      } as Job);
    }
  }

  // Batch Job Methods

  /**
   * Creates a new batch job using domain entity factory - Returns Result
   */
  async createBatchJobResult(request: CreateBatchJobRequest): Promise<Result<BatchJob, JobServiceError>> {
    if (stryMutAct_9fa48("430")) {
      {}
    } else {
      stryCov_9fa48("430");
      const batchJobResult = createBatchJobEntity(request);
      if (stryMutAct_9fa48("432") ? false : stryMutAct_9fa48("431") ? true : (stryCov_9fa48("431", "432"), batchJobResult.isErr())) {
        if (stryMutAct_9fa48("433")) {
          {}
        } else {
          stryCov_9fa48("433");
          return batchJobResult;
        }
      }
      return await this.repository.createBatch(batchJobResult.value);
    }
  }

  /**
   * Creates a new batch job - Legacy method that throws on error
   * @deprecated Use createBatchJobResult for proper error handling
   */
  async createBatchJob(request: CreateBatchJobRequest): Promise<BatchJob> {
    if (stryMutAct_9fa48("434")) {
      {}
    } else {
      stryCov_9fa48("434");
      const result = await this.createBatchJobResult(request);
      if (stryMutAct_9fa48("436") ? false : stryMutAct_9fa48("435") ? true : (stryCov_9fa48("435", "436"), result.isErr())) {
        if (stryMutAct_9fa48("437")) {
          {}
        } else {
          stryCov_9fa48("437");
          throw result.error;
        }
      }
      return result.value;
    }
  }

  /**
   * Retrieves a batch job by ID - Returns Result
   */
  async getBatchJobResult(batchJobId: string): Promise<Result<BatchJob, JobServiceError>> {
    if (stryMutAct_9fa48("438")) {
      {}
    } else {
      stryCov_9fa48("438");
      return await this.repository.findBatchById(batchJobId);
    }
  }

  /**
   * Retrieves a batch job by ID - Legacy method that returns null on error
   * @deprecated Use getBatchJobResult for proper error handling
   */
  async getBatchJob(batchJobId: string): Promise<BatchJob | null> {
    if (stryMutAct_9fa48("439")) {
      {}
    } else {
      stryCov_9fa48("439");
      const result = await this.repository.findBatchById(batchJobId);
      return result.isOk() ? result.value : null;
    }
  }

  /**
   * Updates batch job status - Returns Result
   */
  async updateBatchJobStatusResult(batchJobId: string, status: JobStatusType, updates: Partial<Pick<BatchJob, 'completedCount' | 'error' | 'childJobIds'>> = {}): Promise<Result<BatchJob, JobServiceError>> {
    if (stryMutAct_9fa48("440")) {
      {}
    } else {
      stryCov_9fa48("440");
      const now = new Date().toISOString();
      return await this.repository.updateBatchStatus(batchJobId, status, stryMutAct_9fa48("441") ? {} : (stryCov_9fa48("441"), {
        ...updates,
        updatedAt: now
      }));
    }
  }

  /**
   * Updates batch job status - Legacy method that throws on error
   * @deprecated Use updateBatchJobStatusResult for proper error handling
   */
  async updateBatchJobStatus(batchJobId: string, status: JobStatusType, updates: Partial<Pick<BatchJob, 'completedCount' | 'error' | 'childJobIds'>> = {}): Promise<BatchJob> {
    if (stryMutAct_9fa48("442")) {
      {}
    } else {
      stryCov_9fa48("442");
      const result = await this.updateBatchJobStatusResult(batchJobId, status, updates);
      if (stryMutAct_9fa48("444") ? false : stryMutAct_9fa48("443") ? true : (stryCov_9fa48("443", "444"), result.isErr())) {
        if (stryMutAct_9fa48("445")) {
          {}
        } else {
          stryCov_9fa48("445");
          throw result.error;
        }
      }
      return result.value;
    }
  }

  /**
   * Increments batch job progress using domain calculation - Returns Result
   */
  async incrementBatchJobProgressResult(batchJobId: string): Promise<Result<BatchJob, JobServiceError>> {
    if (stryMutAct_9fa48("446")) {
      {}
    } else {
      stryCov_9fa48("446");
      const batchJobResult = await this.repository.findBatchById(batchJobId);
      if (stryMutAct_9fa48("448") ? false : stryMutAct_9fa48("447") ? true : (stryCov_9fa48("447", "448"), batchJobResult.isErr())) {
        if (stryMutAct_9fa48("449")) {
          {}
        } else {
          stryCov_9fa48("449");
          return batchJobResult;
        }
      }
      const progressResult = calculateBatchProgress(batchJobResult.value, 1);
      if (stryMutAct_9fa48("451") ? false : stryMutAct_9fa48("450") ? true : (stryCov_9fa48("450", "451"), progressResult.isErr())) {
        if (stryMutAct_9fa48("452")) {
          {}
        } else {
          stryCov_9fa48("452");
          return err(progressResult.error);
        }
      }
      const {
        status,
        completedCount
      } = progressResult.value;
      return await this.repository.updateBatchStatus(batchJobId, status, stryMutAct_9fa48("453") ? {} : (stryCov_9fa48("453"), {
        completedCount,
        updatedAt: new Date().toISOString()
      }));
    }
  }

  /**
   * Increments batch job progress - Legacy method that throws on error
   * @deprecated Use incrementBatchJobProgressResult for proper error handling
   */
  async incrementBatchJobProgress(batchJobId: string): Promise<BatchJob> {
    if (stryMutAct_9fa48("454")) {
      {}
    } else {
      stryCov_9fa48("454");
      const result = await this.incrementBatchJobProgressResult(batchJobId);
      if (stryMutAct_9fa48("456") ? false : stryMutAct_9fa48("455") ? true : (stryCov_9fa48("455", "456"), result.isErr())) {
        if (stryMutAct_9fa48("457")) {
          {}
        } else {
          stryCov_9fa48("457");
          throw result.error;
        }
      }
      return result.value;
    }
  }

  /**
   * Retrieves all jobs for a batch - Returns Result
   */
  async getJobsByBatchIdResult(batchJobId: string): Promise<Result<Job[], JobServiceError>> {
    if (stryMutAct_9fa48("458")) {
      {}
    } else {
      stryCov_9fa48("458");
      return await this.repository.findByBatchId(batchJobId);
    }
  }

  /**
   * Retrieves all jobs for a batch - Legacy method that throws on error
   * @deprecated Use getJobsByBatchIdResult for proper error handling
   */
  async getJobsByBatchId(batchJobId: string): Promise<Job[]> {
    if (stryMutAct_9fa48("459")) {
      {}
    } else {
      stryCov_9fa48("459");
      const result = await this.repository.findByBatchId(batchJobId);
      if (stryMutAct_9fa48("461") ? false : stryMutAct_9fa48("460") ? true : (stryCov_9fa48("460", "461"), result.isErr())) {
        if (stryMutAct_9fa48("462")) {
          {}
        } else {
          stryCov_9fa48("462");
          throw result.error;
        }
      }
      return result.value;
    }
  }
}