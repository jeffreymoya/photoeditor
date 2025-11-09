import { Text } from '@tamagui/core';
import { YStack } from '@tamagui/stacks';
import React from 'react';

/**
 * JobsHeader component for screen titles and descriptions
 *
 * Uses Tamagui Text primitive with design tokens for consistent typography
 * per TASK-0909 NativeWind v5 + Tamagui integration.
 *
 * Implements standards/frontend-tier.md#ui-components-layer atomic design.
 */

export type JobsHeaderProps = {
  readonly title: string;
  readonly subtitle?: string;
};

export const JobsHeader: React.FC<JobsHeaderProps> = ({ title, subtitle }) => {
  return (
    <YStack marginBottom="$6">
      <Text
        fontSize="$4xl"
        fontWeight="700"
        color="$color"
        marginBottom={subtitle ? '$2' : undefined}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text fontSize="$base" color="$colorPress">
          {subtitle}
        </Text>
      ) : null}
    </YStack>
  );
};
