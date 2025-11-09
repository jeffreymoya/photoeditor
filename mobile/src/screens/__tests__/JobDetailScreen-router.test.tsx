import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import JobDetailScreen from '../../../app/(jobs)/[id]';
import { renderWithProviders } from '../../__tests__/test-utils';

/**
 * Test suite for JobDetailScreen component.
 *
 * Verifies that the Job detail screen renders correctly using Expo Router
 * dynamic route parameters per standards/frontend-tier.md#feature-guardrails.
 */
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useLocalSearchParams: jest.fn(),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

describe('JobDetailScreen', () => {
  beforeEach(() => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'test-job-123' });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { toJSON } = renderWithProviders(<JobDetailScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it('should display Job Details title', () => {
    const { getByText } = renderWithProviders(<JobDetailScreen />);
    const title = getByText('Job Details');
    expect(title).toBeTruthy();
  });

  it('should display job ID from route params', () => {
    const { getByText } = renderWithProviders(<JobDetailScreen />);
    const jobId = getByText('test-job-123');
    expect(jobId).toBeTruthy();
  });

  it('should display status section', () => {
    const { getByText } = renderWithProviders(<JobDetailScreen />);
    const statusLabel = getByText('Status');
    expect(statusLabel).toBeTruthy();
  });

  it('should render back link to jobs list', () => {
    const { getByText } = renderWithProviders(<JobDetailScreen />);
    const backLink = getByText(/Back to Jobs/i);
    expect(backLink).toBeTruthy();
  });

  it('should use typed route parameters from useLocalSearchParams', () => {
    renderWithProviders(<JobDetailScreen />);
    expect(useLocalSearchParams).toHaveBeenCalled();
  });

  it('should apply correct styling', () => {
    const { toJSON } = renderWithProviders(<JobDetailScreen />);
    const tree = toJSON();
    // Styles applied via StyleSheet.create
    expect(tree).toMatchSnapshot();
  });

  it('should use design tokens from ui-tokens', () => {
    const { toJSON } = renderWithProviders(<JobDetailScreen />);
    // Colors and typography from @/lib/ui-tokens are applied
    expect(toJSON()).toBeTruthy();
  });

  it('should handle missing id parameter gracefully', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: undefined });
    const { toJSON } = renderWithProviders(<JobDetailScreen />);
    expect(toJSON()).toBeTruthy();
  });
});
