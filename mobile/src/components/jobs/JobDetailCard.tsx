import { Text } from '@tamagui/core';
import { YStack } from '@tamagui/stacks';
import React from 'react';

/**
 * JobDetailCard component for displaying job detail information
 *
 * Uses Tamagui primitives (YStack, XStack, Text) for themed layout
 * per TASK-0909 curated primitives subset.
 *
 * Implements standards/frontend-tier.md#ui-components-layer atomic design
 * with theme-aware styling that renders identically on iOS and Android.
 */

export type JobDetailCardProps = {
  readonly label: string;
  readonly value: string;
  readonly variant?: 'default' | 'success' | 'warning' | 'error';
};

export const JobDetailCard: React.FC<JobDetailCardProps> = ({
  label,
  value,
  variant = 'default',
}) => {
  const valueColor =
    variant === 'success'
      ? '$success600'
      : variant === 'warning'
        ? '$warning600'
        : variant === 'error'
          ? '$error600'
          : '$color';

  return (
    <YStack
      backgroundColor="$backgroundStrong"
      borderRadius="$4"
      padding="$4"
      marginBottom="$3"
      borderWidth={1}
      borderColor="$borderColor"
    >
      <Text fontSize="$sm" color="$colorPress" marginBottom="$1">
        {label}
      </Text>
      <Text fontSize="$base" fontWeight="500" color={valueColor}>
        {value}
      </Text>
    </YStack>
  );
};
