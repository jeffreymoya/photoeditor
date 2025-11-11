/**
 * SettingsScreen Component Tests
 *
 * Per the Testing Standards:
 * - Exercise mobile React components with @testing-library/react-native
 * - Keep component tests behavioural: assert rendered output
 *
 * Note: SettingsScreen is currently a placeholder with minimal functionality
 */

import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

import { SettingsScreen } from '../SettingsScreen';
import { settingsSlice } from '../../store/slices/settingsSlice';

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
    it('renders title', () => {
      renderWithRedux(<SettingsScreen />);

      expect(screen.getByText('Settings')).toBeTruthy();
    });

    it('renders subtitle', () => {
      renderWithRedux(<SettingsScreen />);

      expect(screen.getByText('Configure your app preferences')).toBeTruthy();
    });

    it('renders without crashing', () => {
      const { toJSON } = render(<SettingsScreen />);

      expect(toJSON()).toBeTruthy();
    });
  });
});
