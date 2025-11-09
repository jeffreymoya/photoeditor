import { TamaguiProvider } from '@tamagui/core';
import { render, type RenderOptions } from '@testing-library/react-native';
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

