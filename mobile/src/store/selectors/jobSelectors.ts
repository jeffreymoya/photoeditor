/**
 * Pure Redux selectors for job/upload state
 * Per the Frontend Tier standard State & Logic Layer:
 * - Selector-first (reselect) for analyzability & performance
 * - Selectors are 100% pure (no I/O imports verified)
 * - Command–Query split (mutations vs selectors)
 */

import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '../index';
import type { Job, BatchJob } from '../slices/jobSlice';

/**
 * Input selectors - pure functions extracting slices
 * Per the TypeScript Standards: Pure predicates, no side effects
 */

// Extract job slice from root state
export const selectJobState = (state: RootState) => state.job;

// Extract jobs array
export const selectJobs = (state: RootState) => state.job.jobs;

// Extract batch jobs array
export const selectBatchJobs = (state: RootState) => state.job.batchJobs;

// Extract active job ID
export const selectActiveJobId = (state: RootState) => state.job.activeJobId;

// Extract active batch job ID
export const selectActiveBatchJobId = (state: RootState) => state.job.activeBatchJobId;

// Extract polling state
export const selectIsPolling = (state: RootState) => state.job.isPolling;

/**
 * Memoized selectors - pure transformations only
 * Per the Frontend Tier standard State & Logic Layer:
 * - Result selectors pure transformations only
 * - Zero I/O imports in selector files (verified via code review)
 */

// Select active job by ID
export const selectActiveJob = createSelector(
  [selectJobs, selectActiveJobId],
  (jobs, activeJobId): Job | undefined => {
    if (!activeJobId) return undefined;
    return jobs.find((job) => job.id === activeJobId);
  }
);

// Select active batch job by ID
export const selectActiveBatchJob = createSelector(
  [selectBatchJobs, selectActiveBatchJobId],
  (batchJobs, activeBatchJobId): BatchJob | undefined => {
    if (!activeBatchJobId) return undefined;
    return batchJobs.find((batchJob) => batchJob.id === activeBatchJobId);
  }
);

// Select jobs filtered by status (pure transformation)
export const selectJobsByStatus = (status: Job['status']) =>
  createSelector([selectJobs], (jobs): Job[] => {
    return jobs.filter((job) => job.status === status);
  });

// Select completed jobs
export const selectCompletedJobs = createSelector([selectJobs], (jobs): Job[] => {
  return jobs.filter((job) => job.status === 'COMPLETED');
});

// Select failed jobs
export const selectFailedJobs = createSelector([selectJobs], (jobs): Job[] => {
  return jobs.filter((job) => job.status === 'FAILED');
});

// Select in-progress jobs (QUEUED, PROCESSING, EDITING)
export const selectInProgressJobs = createSelector([selectJobs], (jobs): Job[] => {
  return jobs.filter(
    (job) =>
      job.status === 'QUEUED' || job.status === 'PROCESSING' || job.status === 'EDITING'
  );
});

// Select job by ID (factory function returning memoized selector)
export const makeSelectJobById = (jobId: string) =>
  createSelector([selectJobs], (jobs): Job | undefined => {
    return jobs.find((job) => job.id === jobId);
  });

// Select batch job by ID (factory function returning memoized selector)
export const makeSelectBatchJobById = (batchJobId: string) =>
  createSelector([selectBatchJobs], (batchJobs): BatchJob | undefined => {
    return batchJobs.find((batchJob) => batchJob.id === batchJobId);
  });

// Select jobs belonging to a batch
export const makeSelectJobsByBatchId = (batchJobId: string) =>
  createSelector([selectJobs], (jobs): Job[] => {
    return jobs.filter((job) => job.batchJobId === batchJobId);
  });

// Calculate batch job progress (percentage)
export const selectBatchJobProgress = (batchJobId: string) =>
  createSelector([selectBatchJobs], (batchJobs): number => {
    const batchJob = batchJobs.find((bj) => bj.id === batchJobId);
    if (!batchJob || batchJob.totalCount === 0) return 0;
    return Math.round((batchJob.completedCount / batchJob.totalCount) * 100);
  });

// Check if any job is in progress (for UI loading states)
export const selectHasJobInProgress = createSelector([selectJobs], (jobs): boolean => {
  return jobs.some(
    (job) =>
      job.status === 'QUEUED' || job.status === 'PROCESSING' || job.status === 'EDITING'
  );
});

// Check if any batch job is in progress
export const selectHasBatchJobInProgress = createSelector(
  [selectBatchJobs],
  (batchJobs): boolean => {
    return batchJobs.some(
      (batchJob) =>
        batchJob.status === 'QUEUED' ||
        batchJob.status === 'PROCESSING' ||
        batchJob.status === 'EDITING'
    );
  }
);

// Count jobs by status (for analytics/UI)
export const selectJobStatusCounts = createSelector([selectJobs], (jobs) => {
  return jobs.reduce(
    (counts, job) => {
      counts[job.status] = (counts[job.status] || 0) + 1;
      return counts;
    },
    {} as Record<Job['status'], number>
  );
});

// Get most recent job (latest createdAt timestamp)
export const selectMostRecentJob = createSelector([selectJobs], (jobs): Job | undefined => {
  if (jobs.length === 0) return undefined;
  return jobs.reduce((latest, current) => {
    return new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest;
  });
});

// Get most recent batch job
export const selectMostRecentBatchJob = createSelector(
  [selectBatchJobs],
  (batchJobs): BatchJob | undefined => {
    if (batchJobs.length === 0) return undefined;
    return batchJobs.reduce((latest, current) => {
      return new Date(current.createdAt) > new Date(latest.createdAt) ? current : latest;
    });
  }
);

/**
 * Combined selectors for complex queries
 */

// Select all active work (active job or active batch job)
export const selectActiveWork = createSelector(
  [selectActiveJob, selectActiveBatchJob],
  (activeJob, activeBatchJob) => ({
    job: activeJob,
    batchJob: activeBatchJob,
    hasActiveWork: activeJob !== undefined || activeBatchJob !== undefined,
  })
);

// Select overall activity state
export const selectActivityState = createSelector(
  [selectHasJobInProgress, selectHasBatchJobInProgress, selectIsPolling],
  (hasJobInProgress, hasBatchJobInProgress, isPolling) => ({
    hasJobInProgress,
    hasBatchJobInProgress,
    isPolling,
    isActive: hasJobInProgress || hasBatchJobInProgress || isPolling,
  })
);
