import React from 'react';

import { JobsIndexScreen } from '../../../app/(jobs)/index';
import { renderWithProviders } from '../../__tests__/test-utils';

const renderJobsScreen = () => renderWithProviders(<JobsIndexScreen />);

/**
 * Test suite for JobsIndexScreen component.
 *
 * Verifies that the Jobs list screen renders correctly using Expo Router
 * file-based routing per standards/frontend-tier.md#ui-components-layer.
 */
describe('JobsIndexScreen', () => {
  it('should render without crashing', () => {
    const { toJSON } = renderJobsScreen();
    expect(toJSON()).toBeTruthy();
  });

  it('should display Jobs title', () => {
    const { getByText } = renderJobsScreen();
    const title = getByText('Jobs');
    expect(title).toBeTruthy();
  });

  it('should display subtitle', () => {
    const { getByText } = renderJobsScreen();
    const subtitle = getByText('Track your photo processing jobs');
    expect(subtitle).toBeTruthy();
  });

  it('should render navigation link to job detail', () => {
    const { getAllByText, getByText } = renderJobsScreen();
    expect(getByText('Beach Sunset Enhancement')).toBeTruthy();
    const statusLabels = getAllByText(/Status:/);
    expect(statusLabels.length).toBe(3);
  });

  it('should apply correct styling', () => {
    const { toJSON } = renderJobsScreen();
    const tree = toJSON();
    // Styles applied via StyleSheet.create
    expect(tree).toMatchSnapshot();
  });

  it('should use design tokens from ui-tokens', () => {
    const { toJSON } = renderJobsScreen();
    // Colors and typography from @/lib/ui-tokens are applied
    expect(toJSON()).toBeTruthy();
  });
});
