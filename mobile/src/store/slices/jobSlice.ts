import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface Job {
  id: string;
  status: 'QUEUED' | 'PROCESSING' | 'EDITING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  updatedAt: string;
  finalS3Key?: string;
  error?: string;
  batchJobId?: string;
  prompt?: string;
}

export interface BatchJob {
  id: string;
  status: 'QUEUED' | 'PROCESSING' | 'EDITING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  updatedAt: string;
  sharedPrompt: string;
  childJobIds: string[];
  completedCount: number;
  totalCount: number;
  error?: string;
}

export interface JobState {
  jobs: Job[];
  batchJobs: BatchJob[];
  activeJobId: string | null;
  activeBatchJobId: string | null;
  isPolling: boolean;
}

const initialState: JobState = {
  jobs: [],
  batchJobs: [],
  activeJobId: null,
  activeBatchJobId: null,
  isPolling: false,
};

export const jobSlice = createSlice({
  name: 'job',
  initialState,
  reducers: {
    addJob: (state, action: PayloadAction<Job>) => {
      state.jobs.unshift(action.payload);
      state.activeJobId = action.payload.id;
    },
    updateJob: (state, action: PayloadAction<Partial<Job> & { id: string }>) => {
      const index = state.jobs.findIndex((job) => job.id === action.payload.id);
      if (index !== -1) {
        state.jobs[index] = { ...state.jobs[index], ...action.payload };
      }
    },
    removeJob: (state, action: PayloadAction<string>) => {
      state.jobs = state.jobs.filter((job) => job.id !== action.payload);
      if (state.activeJobId === action.payload) {
        state.activeJobId = null;
      }
    },
    setActiveJob: (state, action: PayloadAction<string | null>) => {
      state.activeJobId = action.payload;
    },
    setPolling: (state, action: PayloadAction<boolean>) => {
      state.isPolling = action.payload;
    },
    clearJobs: (state) => {
      state.jobs = [];
      state.activeJobId = null;
      state.isPolling = false;
    },
    // Batch Job Actions
    addBatchJob: (state, action: PayloadAction<BatchJob>) => {
      state.batchJobs.unshift(action.payload);
      state.activeBatchJobId = action.payload.id;
    },
    updateBatchJob: (state, action: PayloadAction<Partial<BatchJob> & { id: string }>) => {
      const index = state.batchJobs.findIndex((batchJob) => batchJob.id === action.payload.id);
      if (index !== -1) {
        state.batchJobs[index] = { ...state.batchJobs[index], ...action.payload };
      }
    },
    removeBatchJob: (state, action: PayloadAction<string>) => {
      state.batchJobs = state.batchJobs.filter((batchJob) => batchJob.id !== action.payload);
      if (state.activeBatchJobId === action.payload) {
        state.activeBatchJobId = null;
      }
    },
    setActiveBatchJob: (state, action: PayloadAction<string | null>) => {
      state.activeBatchJobId = action.payload;
    },
    clearBatchJobs: (state) => {
      state.batchJobs = [];
      state.activeBatchJobId = null;
    },
    clearAllJobs: (state) => {
      state.jobs = [];
      state.batchJobs = [];
      state.activeJobId = null;
      state.activeBatchJobId = null;
      state.isPolling = false;
    },
  },
});

export const {
  addJob,
  updateJob,
  removeJob,
  setActiveJob,
  setPolling,
  clearJobs,
  addBatchJob,
  updateBatchJob,
  removeBatchJob,
  setActiveBatchJob,
  clearBatchJobs,
  clearAllJobs,
} = jobSlice.actions;