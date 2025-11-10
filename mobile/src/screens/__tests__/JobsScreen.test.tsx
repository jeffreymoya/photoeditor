/**
 * JobsScreen Component Tests
 *
 * Per the Testing Standards:
 * - Exercise mobile React components with @testing-library/react-native
 * - Keep component tests behavioural: simulate user events, assert rendered output
 *
 * Note: Tests FlashList v2 vertical list demonstration (TASK-0910)
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { JobsScreen } from '../JobsScreen';

describe('JobsScreen', () => {
  describe('Basic Rendering', () => {
    it('renders title', () => {
      render(<JobsScreen />);

      expect(screen.getByText('Jobs')).toBeTruthy();
    });

    it('renders FlashList v2 subtitle', () => {
      render(<JobsScreen />);

      expect(screen.getByText('FlashList v2 vertical list demonstration')).toBeTruthy();
    });

    it('renders without crashing', () => {
      const { toJSON } = render(<JobsScreen />);

      expect(toJSON()).toBeTruthy();
    });
  });

  describe('FlashList v2 Integration', () => {
    /**
     * Verify FlashList v2 is properly integrated with standard vertical list
     *
     * Per TASK-0910:
     * - Job history migrated to FlashList v2
     * - Standard vertical scrolling pattern
     * - Proper TypeScript typing for FlashList v2
     */
    it('renders mock job items', () => {
      render(<JobsScreen />);

      // Verify mock job data is rendered
      expect(screen.getByText('Photo Enhancement')).toBeTruthy();
      expect(screen.getByText('Background Removal')).toBeTruthy();
      expect(screen.getByText('Color Correction')).toBeTruthy();
    });

    it('renders job status badges', () => {
      render(<JobsScreen />);

      // Verify status badges are displayed (multiple COMPLETED items)
      expect(screen.getAllByText('COMPLETED').length).toBeGreaterThan(0);
      expect(screen.getByText('PROCESSING')).toBeTruthy();
      expect(screen.getByText('PENDING')).toBeTruthy();
      expect(screen.getByText('FAILED')).toBeTruthy();
    });

    it('renders job timestamps', () => {
      render(<JobsScreen />);

      // Verify timestamps are displayed
      expect(screen.getByText('2025-11-10 10:30')).toBeTruthy();
      expect(screen.getByText('2025-11-10 10:45')).toBeTruthy();
    });

    it('demonstrates vertical list pattern', () => {
      render(<JobsScreen />);

      // FlashList renders all 6 mock job items
      expect(screen.getByText('Photo Enhancement')).toBeTruthy();
      expect(screen.getByText('Crop & Rotate')).toBeTruthy();
    });
  });
});
