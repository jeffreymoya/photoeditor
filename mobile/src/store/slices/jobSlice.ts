import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface Job {
  id: string;
  status: 'QUEUED' | 'PROCESSING' | 'EDITING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  updatedAt: string;
  finalS3Key?: string;
  error?: string;
}

export interface JobState {
  jobs: Job[];
  activeJobId: string | null;
  isPolling: boolean;
}

const initialState: JobState = {
  jobs: [],
  activeJobId: null,
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
  },
});

export const {
  addJob,
  updateJob,
  removeJob,
  setActiveJob,
  setPolling,
  clearJobs,
} = jobSlice.actions;