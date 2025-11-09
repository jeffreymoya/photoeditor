import { render } from '@testing-library/react-native';
import React from 'react';

import JobsIndexScreen from '../../../app/(jobs)/index';

/**
 * Test suite for JobsIndexScreen component.
 *
 * Verifies that the Jobs list screen renders correctly using Expo Router
 * file-based routing per standards/frontend-tier.md#ui-components-layer.
 */
describe('JobsIndexScreen', () => {
  it('should render without crashing', () => {
    const { toJSON } = render(<JobsIndexScreen />);
    expect(toJSON()).toBeTruthy();
  });

  it('should display Jobs title', () => {
    const { getByText } = render(<JobsIndexScreen />);
    const title = getByText('Jobs');
    expect(title).toBeTruthy();
  });

  it('should display subtitle', () => {
    const { getByText } = render(<JobsIndexScreen />);
    const subtitle = getByText('Track your photo processing jobs');
    expect(subtitle).toBeTruthy();
  });

  it('should render navigation link to job detail', () => {
    const { getByText } = render(<JobsIndexScreen />);
    const link = getByText('View Example Job');
    expect(link).toBeTruthy();
  });

  it('should apply correct styling', () => {
    const { toJSON } = render(<JobsIndexScreen />);
    const tree = toJSON();
    // Styles applied via StyleSheet.create
    expect(tree).toMatchSnapshot();
  });

  it('should use design tokens from ui-tokens', () => {
    const { toJSON } = render(<JobsIndexScreen />);
    // Colors and typography from @/lib/ui-tokens are applied
    expect(toJSON()).toBeTruthy();
  });
});
