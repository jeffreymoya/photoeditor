import { Stack } from 'expo-router';
import React from 'react';
import { Provider } from 'react-redux';

import { store } from '@/store';

/**
 * Root layout for Expo Router application.
 *
 * This layout wraps the entire app with necessary providers (Redux, etc.)
 * and configures the root navigation stack per Expo Router conventions.
 * Implements file-based routing per standards/frontend-tier.md#feature-guardrails.
 *
 * Mixed navigation period: This coexists with existing React Navigation setup
 * until full migration is complete.
 */
export const RootLayout = () => {
  return (
    <Provider store={store}>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        {/* Jobs surface with file-based routing */}
        <Stack.Screen name="(jobs)" options={{ headerShown: false }} />
      </Stack>
    </Provider>
  );
};

export default RootLayout;
