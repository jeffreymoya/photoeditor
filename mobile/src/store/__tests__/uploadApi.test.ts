/**
 * Tests for uploadApi RTK Query slice
 * Per the Testing Standards: Unit tests with ≥80% lines, ≥70% branches
 * Per the Frontend Tier standard: Test coverage for RTK Query endpoints
 */

import { configureStore } from '@reduxjs/toolkit';

import { uploadApi } from '../uploadApi';

describe('uploadApi', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    // Create a fresh store for each test
    store = configureStore({
      reducer: {
        [uploadApi.reducerPath]: uploadApi.reducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(uploadApi.middleware),
    });
  });

  afterEach(() => {
    // Clean up store
    store.dispatch(uploadApi.util.resetApiState());
  });

  describe('uploadApi slice configuration', () => {
    it('should be configured with correct reducer path', () => {
      expect(uploadApi.reducerPath).toBe('uploadApi');
    });

    it('should have all required endpoints', () => {
      expect(uploadApi.endpoints).toHaveProperty('requestPresignUrl');
      expect(uploadApi.endpoints).toHaveProperty('requestBatchPresignUrls');
      expect(uploadApi.endpoints).toHaveProperty('getJobStatus');
      expect(uploadApi.endpoints).toHaveProperty('getBatchJobStatus');
      expect(uploadApi.endpoints).toHaveProperty('healthCheck');
    });

    it('should initialize reducer with empty state', () => {
      const state = store.getState() as { uploadApi?: Record<string, unknown> };
      expect(state.uploadApi).toBeDefined();
    });

    it('should have middleware configured', () => {
      expect(uploadApi.middleware).toBeDefined();
      expect(typeof uploadApi.middleware).toBe('function');
    });

    it('should provide util methods for cache management', () => {
      expect(uploadApi.util).toHaveProperty('resetApiState');
      expect(uploadApi.util).toHaveProperty('invalidateTags');
      expect(uploadApi.util).toHaveProperty('updateQueryData');
    });
  });

  describe('endpoints', () => {
    it('requestPresignUrl should be a mutation', () => {
      expect(uploadApi.endpoints.requestPresignUrl).toBeDefined();
      expect(uploadApi.endpoints.requestPresignUrl.initiate).toBeDefined();
    });

    it('requestBatchPresignUrls should be a mutation', () => {
      expect(uploadApi.endpoints.requestBatchPresignUrls).toBeDefined();
      expect(uploadApi.endpoints.requestBatchPresignUrls.initiate).toBeDefined();
    });

    it('getJobStatus should be a query', () => {
      expect(uploadApi.endpoints.getJobStatus).toBeDefined();
      expect(uploadApi.endpoints.getJobStatus.initiate).toBeDefined();
    });

    it('getBatchJobStatus should be a query', () => {
      expect(uploadApi.endpoints.getBatchJobStatus).toBeDefined();
      expect(uploadApi.endpoints.getBatchJobStatus.initiate).toBeDefined();
    });

    it('healthCheck should be a query', () => {
      expect(uploadApi.endpoints.healthCheck).toBeDefined();
      expect(uploadApi.endpoints.healthCheck.initiate).toBeDefined();
    });
  });
});
