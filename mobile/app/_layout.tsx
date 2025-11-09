import { TamaguiProvider } from '@tamagui/core';
import { Stack } from 'expo-router';
import React from 'react';
import { Provider } from 'react-redux';

import { store } from '@/store';

import config from '../tamagui.config';
import '../global.css';

/**
 * Root layout for Expo Router application.
 *
 * This layout wraps the entire app with necessary providers (Redux, Tamagui, etc.)
 * and configures the root navigation stack per Expo Router conventions.
 * Implements file-based routing per standards/frontend-tier.md#feature-guardrails.
 *
 * Design system integration (TASK-0909):
 * - NativeWind v5 global CSS imported for compile-time utility processing
 * - Tamagui provider configured with curated primitives subset
 * - Theme-aware styling with light/dark mode support
 *
 * Mixed navigation period: This coexists with existing React Navigation setup
 * until full migration is complete.
 */
export const RootLayout = () => {
  return (
    <Provider store={store}>
      <TamaguiProvider config={config} defaultTheme="light">
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        >
          {/* Jobs surface with file-based routing */}
          <Stack.Screen name="(jobs)" options={{ headerShown: false }} />
        </Stack>
      </TamaguiProvider>
    </Provider>
  );
};

export default RootLayout;
