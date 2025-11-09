import { Text } from '@tamagui/core';
import { YStack, XStack } from '@tamagui/stacks';
import { useLocalSearchParams, Link } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JobDetailCard, JobsHeader } from '@/components/jobs';

/**
 * Job detail screen using Expo Router file-based routing.
 *
 * This screen displays details for a specific photo processing job using
 * NativeWind v5 and Tamagui themed components per TASK-0909.
 *
 * Uses dynamic route parameter [id] per Expo Router conventions.
 * Implements file-based routing per standards/frontend-tier.md#feature-guardrails
 * with theme-aware styling that renders identically on iOS and Android.
 */
export const JobDetailScreen = () => {
  // Use Expo Router's typed route params
  const { id } = useLocalSearchParams<{ id: string }>();

  // TODO: Replace with actual Redux state or API data
  const mockJob: {
    readonly id: string;
    readonly title: string;
    readonly status: 'pending' | 'processing' | 'completed' | 'failed';
    readonly createdAt: string;
    readonly progress: number;
  } = {
    id,
    title: 'Beach Sunset Enhancement',
    status: 'processing',
    createdAt: '2025-01-15T12:00:00.000Z',
    progress: 75,
  };

  const getStatusVariant = (
    status: 'pending' | 'processing' | 'completed' | 'failed'
  ): 'default' | 'success' | 'error' => {
    if (status === 'completed') return 'success';
    if (status === 'failed') return 'error';
    return 'default';
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView>
        <YStack padding="$4" backgroundColor="$background" flex={1}>
          <JobsHeader title="Job Details" />

          <YStack gap="$2">
            <JobDetailCard label="Job ID" value={mockJob.id} />
            <JobDetailCard label="Title" value={mockJob.title} />
            <JobDetailCard
              label="Status"
              value={
                mockJob.status.charAt(0).toUpperCase() + mockJob.status.slice(1)
              }
              variant={getStatusVariant(mockJob.status)}
            />
            <JobDetailCard
              label="Progress"
              value={`${mockJob.progress}%`}
              variant={mockJob.progress === 100 ? 'success' : 'default'}
            />
            <JobDetailCard
              label="Created"
              value={new Date(mockJob.createdAt).toLocaleString()}
            />
          </YStack>

          <Link href="/jobs" asChild>
            <Pressable>
              <XStack
                marginTop="$6"
                padding="$3"
                backgroundColor="$backgroundStrong"
                borderRadius="$4"
                borderWidth={1}
                borderColor="$borderColor"
                pressStyle={{
                  backgroundColor: '$backgroundPress',
                }}
              >
                <Text fontSize="$base" color="$primary" fontWeight="500">
                  ← Back to Jobs
                </Text>
              </XStack>
            </Pressable>
          </Link>
        </YStack>
      </ScrollView>
    </SafeAreaView>
  );
};

export default JobDetailScreen;
