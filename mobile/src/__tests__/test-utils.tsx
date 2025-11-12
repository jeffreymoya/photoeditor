import { TamaguiProvider } from '@tamagui/core';
import { render, type RenderOptions, waitFor, screen } from '@testing-library/react-native';
import React, { type ReactElement } from 'react';

import config from '../../tamagui.config';

/**
 * Shared render helper that injects the TamaguiProvider so Tamagui primitives
 * have the expected theme context during tests.
 */
export const renderWithProviders = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) =>
  render(
    <TamaguiProvider config={config} defaultTheme="light">
      {ui}
    </TamaguiProvider>,
    options
  );

/**
 * Waits for device capability to be loaded in components using getDeviceCapability.
 *
 * Standards alignment:
 * - standards/testing-standards.md#react-component-testing: Use findBy* queries for async UI states
 * - standards/typescript.md#testability: Type-safe helper for deterministic async testing
 *
 * Usage:
 * ```typescript
 * renderWithRedux(<SettingsScreen />);
 * await waitForDeviceCapabilityReady();
 * expect(screen.getByText('Configure your app preferences')).toBeTruthy();
 * ```
 *
 * @param timeout - Maximum time to wait in milliseconds (default: 2000)
 * @returns Promise that resolves when the loading state disappears
 * @throws Error if loading text is still present after timeout
 */
export const waitForDeviceCapabilityReady = async (timeout = 2000): Promise<void> => {
  await waitFor(
    () => {
      // Assert that the loading text is no longer present
      expect(screen.queryByText('Loading device information...')).toBeNull();
    },
    { timeout }
  );
};

