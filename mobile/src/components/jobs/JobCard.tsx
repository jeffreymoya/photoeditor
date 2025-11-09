import { Text } from '@tamagui/core';
import { YStack } from '@tamagui/stacks';
import { Link } from 'expo-router';
import React from 'react';
import { Pressable } from 'react-native';

/**
 * JobCard component for displaying job summary in list
 *
 * Uses Tamagui primitives (YStack, Text) and NativeWind v5 utility classes
 * for themed, cross-platform styling per TASK-0909.
 *
 * Implements standards/frontend-tier.md#ui-components-layer atomic design
 * with Tamagui curated subset (Stack, Text components).
 */

export type JobCardProps = {
  readonly id: string;
  readonly title: string;
  readonly status: 'pending' | 'processing' | 'completed' | 'failed';
  readonly createdAt: string;
};

export const JobCard: React.FC<JobCardProps> = ({
  id,
  title,
  status,
  createdAt,
}) => {
  const statusColor =
    status === 'completed'
      ? '$success600'
      : status === 'failed'
        ? '$error600'
        : status === 'processing'
          ? '$primary600'
          : '$neutral500';

  return (
    <Link href={`/jobs/${id}`} asChild>
      <Pressable>
        <YStack
          backgroundColor="$backgroundStrong"
          borderRadius="$4"
          padding="$4"
          marginBottom="$3"
          borderWidth={1}
          borderColor="$borderColor"
          pressStyle={{
            backgroundColor: '$backgroundPress',
            borderColor: '$borderColorPress',
          }}
        >
          <Text
            fontSize="$lg"
            fontWeight="600"
            color="$color"
            marginBottom="$2"
          >
            {title}
          </Text>

          <YStack gap="$1">
            <Text fontSize="$sm" color={statusColor} fontWeight="500">
              Status: {status.charAt(0).toUpperCase() + status.slice(1)}
            </Text>
            <Text fontSize="$sm" color="$colorPress">
              Created: {new Date(createdAt).toLocaleDateString()}
            </Text>
          </YStack>
        </YStack>
      </Pressable>
    </Link>
  );
};
