/**
 * ErrorBoundary Storybook stories
 * Covers error boundary component states per standards/frontend-tier.md#ui-components-layer
 */

import React from 'react';
import { View, Text } from 'react-native';

import { ErrorBoundary } from './ErrorBoundary';

import type { Meta, StoryObj } from '@storybook/react-native';

/**
 * Component that throws an error for testing error boundary
 */
function ErrorThrower(): null {
  throw new Error('Test error from ErrorThrower component');
}

/**
 * Valid component that doesn't throw
 */
function ValidChild() {
  return (
    <View>
      <Text>Valid child component - no errors</Text>
    </View>
  );
}

const meta = {
  title: 'Components/ErrorBoundary',
  component: ErrorBoundary,
  tags: ['autodocs'],
  argTypes: {
    children: {
      description: 'Child components to be wrapped by the error boundary',
    },
  },
} satisfies Meta<typeof ErrorBoundary>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default story showing ErrorBoundary with valid children
 * This demonstrates the normal, non-error state
 */
export const Default: Story = {
  args: {
    children: <ValidChild />,
  },
};

/**
 * Story showing ErrorBoundary catching and displaying an error
 * NOTE: This will show the error UI in Storybook
 */
export const WithError: Story = {
  args: {
    children: <ErrorThrower />,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates the error UI displayed when a child component throws an error. ' +
          'Shows error icon, message, restart button, and error details in dev mode.',
      },
    },
  },
};

/**
 * Story with multiple valid children
 */
export const WithMultipleChildren: Story = {
  args: {
    children: (
      <>
        <ValidChild />
        <ValidChild />
        <ValidChild />
      </>
    ),
  },
};
