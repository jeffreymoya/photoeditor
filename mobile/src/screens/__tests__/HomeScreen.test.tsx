/**
 * HomeScreen Component Tests
 *
 * Per the Testing Standards:
 * - Exercise mobile React components with @testing-library/react-native
 * - Query via labels, roles, or text that mirrors end-user language
 * - Keep component tests behavioural: simulate user events, assert rendered output
 *
 * Coverage target: All happy paths and failure paths per standards/testing-standards.md
 */

import { NavigationContainer } from '@react-navigation/native';
import { configureStore } from '@reduxjs/toolkit';
import { render, screen, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { Provider } from 'react-redux';

import { jobSlice } from '@/store/slices/jobSlice';
import { uploadApi } from '@/store/uploadApi';

import { HomeScreen } from '../HomeScreen';

// Mock the upload feature public exports
jest.mock('@/features/upload/public', () => ({
  useHealthCheckQuery: jest.fn(() => ({
    data: { status: 'ok' },
    isLoading: false,
    error: undefined,
  })),
}));

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
  // Add minimal required navigation methods
  goBack: jest.fn(),
  addListener: jest.fn(),
  removeListener: jest.fn(),
  canGoBack: jest.fn(() => false),
  dispatch: jest.fn(),
  getId: jest.fn(),
  getParent: jest.fn(),
  getState: jest.fn(() => ({ routes: [], index: 0, key: 'test' })),
  isFocused: jest.fn(() => true),
  reset: jest.fn(),
  setOptions: jest.fn(),
  setParams: jest.fn(),
} as never;

/**
 * Test harness with Redux store and navigation providers
 *
 * Per the Frontend Tier standard: Components tested with minimal required providers
 */
function renderHomeScreen(initialState = {}) {
  const store = configureStore({
    reducer: {
      job: jobSlice.reducer,
      [uploadApi.reducerPath]: uploadApi.reducer,
    },
    preloadedState: initialState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(uploadApi.middleware),
  });

  return render(
    <Provider store={store}>
      <NavigationContainer>
        <HomeScreen navigation={mockNavigation} />
      </NavigationContainer>
    </Provider>
  );
}

describe('HomeScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  describe('Basic Rendering', () => {
    it('renders title and subtitle', () => {
      renderHomeScreen();

      expect(screen.getByText('Photo Editor')).toBeTruthy();
      expect(
        screen.getByText('Transform your photos with AI-powered editing')
      ).toBeTruthy();
    });

    it('renders Quick Actions section', () => {
      renderHomeScreen();

      expect(screen.getByText('Quick Actions')).toBeTruthy();
      expect(screen.getByText('Take Photo')).toBeTruthy();
      expect(screen.getByText('Select from Gallery')).toBeTruthy();
      expect(screen.getByText('View Jobs')).toBeTruthy();
    });
  });

  describe('Navigation Actions', () => {
    it('navigates to Camera when Take Photo is pressed', () => {
      renderHomeScreen();

      const takePhotoButton = screen.getByText('Take Photo');
      fireEvent.press(takePhotoButton);

      expect(mockNavigate).toHaveBeenCalledWith('Camera');
      expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

    it('navigates to Gallery when Select from Gallery is pressed', () => {
      renderHomeScreen();

      const galleryButton = screen.getByText('Select from Gallery');
      fireEvent.press(galleryButton);

      expect(mockNavigate).toHaveBeenCalledWith('Gallery');
      expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

    it('navigates to Jobs when View Jobs is pressed', () => {
      renderHomeScreen();

      const viewJobsButton = screen.getByText('View Jobs');
      fireEvent.press(viewJobsButton);

      expect(mockNavigate).toHaveBeenCalledWith('Jobs');
      expect(mockNavigate).toHaveBeenCalledTimes(1);
    });
  });

  describe('Recent Jobs Display', () => {
    it('does not render Recent Jobs section when jobs array is empty', () => {
      renderHomeScreen({
        job: {
          jobs: [],
          batchJobs: [],
          activeJobId: null,
          activeBatchJobId: null,
          isPolling: false,
        },
      });

      expect(screen.queryByText('Recent Jobs')).toBeNull();
      expect(screen.queryByText('View All')).toBeNull();
    });

    it('renders Recent Jobs section when jobs exist', () => {
      const mockJobs = [
        {
          id: 'job-1',
          jobId: 'job-1',
          prompt: 'Make it brighter',
          status: 'completed',
          createdAt: '2025-11-01T10:00:00.000Z',
        },
        {
          id: 'job-2',
          jobId: 'job-2',
          prompt: 'Apply vintage filter',
          status: 'processing',
          createdAt: '2025-11-01T09:00:00.000Z',
        },
      ];

      renderHomeScreen({
        job: {
          jobs: mockJobs,
          batchJobs: [],
          activeJobId: null,
          activeBatchJobId: null,
          isPolling: false,
        },
      });

      expect(screen.getByText('Recent Jobs')).toBeTruthy();
      expect(screen.getByText('View All')).toBeTruthy();
      expect(screen.getByText('Make it brighter')).toBeTruthy();
      expect(screen.getByText('Apply vintage filter')).toBeTruthy();
    });

    it('renders only first 5 recent jobs when more exist', () => {
      const mockJobs = Array.from({ length: 10 }, (_, i) => ({
        id: `job-${i}`,
        jobId: `job-${i}`,
        prompt: `Job ${i} prompt`,
        status: 'completed',
        createdAt: `2025-11-01T${String(i).padStart(2, '0')}:00:00.000Z`,
      }));

      renderHomeScreen({
        job: {
          jobs: mockJobs,
          batchJobs: [],
          activeJobId: null,
          activeBatchJobId: null,
          isPolling: false,
        },
      });

      // First 5 should be visible
      expect(screen.getByText('Job 0 prompt')).toBeTruthy();
      expect(screen.getByText('Job 1 prompt')).toBeTruthy();
      expect(screen.getByText('Job 2 prompt')).toBeTruthy();
      expect(screen.getByText('Job 3 prompt')).toBeTruthy();
      expect(screen.getByText('Job 4 prompt')).toBeTruthy();

      // 6th and beyond should not be visible
      expect(screen.queryByText('Job 5 prompt')).toBeNull();
      expect(screen.queryByText('Job 9 prompt')).toBeNull();
    });

    it('navigates to Jobs screen when View All is pressed', () => {
      const mockJobs = [
        {
          id: 'job-1',
          jobId: 'job-1',
          prompt: 'Test job',
          status: 'completed',
          createdAt: '2025-11-01T10:00:00.000Z',
        },
      ];

      renderHomeScreen({
        job: {
          jobs: mockJobs,
          batchJobs: [],
          activeJobId: null,
          activeBatchJobId: null,
          isPolling: false,
        },
      });

      const viewAllButton = screen.getByText('View All');
      fireEvent.press(viewAllButton);

      expect(mockNavigate).toHaveBeenCalledWith('Jobs');
    });
  });

  describe('Job Status Display', () => {
    it('displays job status badges with correct text', () => {
      const mockJobs = [
        {
          id: 'job-1',
          jobId: 'job-1',
          prompt: 'Test job',
          status: 'completed',
          createdAt: '2025-11-01T10:00:00.000Z',
        },
      ];

      renderHomeScreen({
        job: {
          jobs: mockJobs,
          batchJobs: [],
          activeJobId: null,
          activeBatchJobId: null,
          isPolling: false,
        },
      });

      // Status text should be uppercase
      expect(screen.getByText('COMPLETED')).toBeTruthy();
    });

    it('renders different job statuses correctly', () => {
      const mockJobs = [
        {
          id: 'job-1',
          jobId: 'job-1',
          prompt: 'Completed job',
          status: 'completed',
          createdAt: '2025-11-01T10:00:00.000Z',
        },
        {
          id: 'job-2',
          jobId: 'job-2',
          prompt: 'Processing job',
          status: 'processing',
          createdAt: '2025-11-01T09:00:00.000Z',
        },
        {
          id: 'job-3',
          jobId: 'job-3',
          prompt: 'Failed job',
          status: 'failed',
          createdAt: '2025-11-01T08:00:00.000Z',
        },
      ];

      renderHomeScreen({
        job: {
          jobs: mockJobs,
          batchJobs: [],
          activeJobId: null,
          activeBatchJobId: null,
          isPolling: false,
        },
      });

      expect(screen.getByText('COMPLETED')).toBeTruthy();
      expect(screen.getByText('PROCESSING')).toBeTruthy();
      expect(screen.getByText('FAILED')).toBeTruthy();
    });
  });

  describe('Date Formatting', () => {
    it('formats createdAt date as locale date string', () => {
      const mockJobs = [
        {
          id: 'job-1',
          jobId: 'job-1',
          prompt: 'Test job',
          status: 'completed',
          createdAt: '2025-11-01T10:00:00.000Z',
        },
      ];

      renderHomeScreen({
        job: {
          jobs: mockJobs,
          batchJobs: [],
          activeJobId: null,
          activeBatchJobId: null,
          isPolling: false,
        },
      });

      // Date should be formatted as locale date string
      const expectedDate = new Date('2025-11-01T10:00:00.000Z').toLocaleDateString();
      expect(screen.getByText(expectedDate)).toBeTruthy();
    });
  });
});
