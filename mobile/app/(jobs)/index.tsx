import { YStack } from '@tamagui/stacks';
import React from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JobCard, JobsHeader } from '@/components/jobs';

/**
 * Jobs list screen using Expo Router file-based routing.
 *
 * This screen displays the list of photo processing jobs using NativeWind v5
 * and Tamagui themed components per TASK-0909.
 *
 * Implements file-based routing per standards/frontend-tier.md#feature-guardrails
 * with theme-aware styling that renders identically on iOS and Android.
 */
const mockJobs = [
  {
    id: 'job-001',
    title: 'Beach Sunset Enhancement',
    status: 'completed' as const,
    createdAt: '2025-11-01T12:00:00.000Z',
  },
  {
    id: 'job-002',
    title: 'Portrait Background Removal',
    status: 'processing' as const,
    createdAt: '2025-11-02T12:00:00.000Z',
  },
  {
    id: 'job-003',
    title: 'Product Photo Color Correction',
    status: 'pending' as const,
    createdAt: '2025-11-03T12:00:00.000Z',
  },
];

export const JobsIndexScreen = () => {
  // TODO: Replace with actual Redux state or API data

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView>
        <YStack padding="$4" backgroundColor="$background" flex={1}>
          <JobsHeader
            title="Jobs"
            subtitle="Track your photo processing jobs"
          />

          <YStack gap="$2">
            {mockJobs.map((job) => (
              <JobCard
                key={job.id}
                id={job.id}
                title={job.title}
                status={job.status}
                createdAt={job.createdAt}
              />
            ))}
          </YStack>
        </YStack>
      </ScrollView>
    </SafeAreaView>
  );
};

export default JobsIndexScreen;
