/**
 * SettingsScreen Component Tests
 *
 * Per the Testing Standards:
 * - Exercise mobile React components with @testing-library/react-native
 * - Keep component tests behavioural: assert rendered output
 * - Use findBy* queries for async UI states per standards/testing-standards.md#react-component-testing
 *
 * Note: SettingsScreen loads device capability asynchronously, so tests must await readiness
 * before asserting on post-effect UI (TASK-0914).
 */

import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Provider } from 'react-redux';

import { waitForDeviceCapabilityReady } from '../../__tests__/test-utils';
import { settingsSlice } from '../../store/slices/settingsSlice';
import { SettingsScreen } from '../SettingsScreen';

// Helper to create mock store with Redux
const createMockStore = () => {
  return configureStore({
    reducer: {
      settings: settingsSlice.reducer,
    },
  });
};

// Helper to render components with Redux Provider
const renderWithRedux = (component: React.ReactElement) => {
  const mockStore = createMockStore();
  return render(<Provider store={mockStore}>{component}</Provider>);
};

describe('SettingsScreen', () => {
  describe('Basic Rendering', () => {
    it('renders title', async () => {
      renderWithRedux(<SettingsScreen />);

      // Wait for async device capability to resolve
      await waitForDeviceCapabilityReady();

      expect(screen.getByText('Settings')).toBeTruthy();
    });

    it('renders subtitle', async () => {
      renderWithRedux(<SettingsScreen />);

      // Wait for async device capability to resolve (TASK-0914)
      await waitForDeviceCapabilityReady();

      expect(screen.getByText('Configure your app preferences')).toBeTruthy();
    });

    it('renders without crashing', async () => {
      const { toJSON } = renderWithRedux(<SettingsScreen />);

      // Wait for async device capability to resolve
      await waitForDeviceCapabilityReady();

      expect(toJSON()).toBeTruthy();
    });
  });
});
