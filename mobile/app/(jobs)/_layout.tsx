import { Stack } from 'expo-router';
import React from 'react';

/**
 * Jobs surface layout with co-located configuration.
 *
 * This layout configures the navigation stack for the Jobs feature surface,
 * following Expo Router file-based routing conventions per standards/frontend-tier.md.
 * Co-locating providers and layouts reduces global re-render cost.
 */
export const JobsLayout = () => {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#ffffff',
        },
        headerTintColor: '#000000',
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Jobs',
          headerShown: true,
        }}
      />
      <Stack.Screen
        name="[id]"
        options={{
          title: 'Job Details',
          headerShown: true,
          headerBackTitle: 'Jobs',
        }}
      />
    </Stack>
  );
};

export default JobsLayout;
