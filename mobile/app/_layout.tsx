import { TamaguiProvider } from '@tamagui/core';
import { Stack } from 'expo-router';
import React, { useEffect } from 'react';
import { Provider } from 'react-redux';

import { registerBackgroundTasks, startUploadProcessor } from '@/features/upload/backgroundTasks';
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
 * Background tasks (TASK-0911C):
 * - Per ADR-0010: AsyncStorage queue + 15min background polling
 * - expo-background-task workers registered for upload pipeline
 * - WorkManager (Android) and BGTaskScheduler (iOS) configured in app.json
 * - Upload processor polls queue every 15min, processes pending uploads
 *
 * Mixed navigation period: This coexists with existing React Navigation setup
 * until full migration is complete.
 */
export const RootLayout = () => {
  // Register and start background upload processor on app initialization
  // Per ADR-0010: AsyncStorage queue pattern with 15min polling
  // Per TASK-0911C: expo-background-task for reliable upload execution
  useEffect(() => {
    registerBackgroundTasks();

    // Start upload processor with 15min polling interval
    startUploadProcessor().then(result => {
      if (!result.success) {
        console.error('[RootLayout] Failed to start upload processor', {
          error: result.error,
        });
      }
    });
  }, []);

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
