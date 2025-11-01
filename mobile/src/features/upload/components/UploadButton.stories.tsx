/**
 * UploadButton Storybook stories
 * Covers upload button states per standards/frontend-tier.md#ui-components-layer
 */

import React from 'react';
import { View } from 'react-native';

import { UploadStatus } from '../hooks/useUpload';

import { UploadButton } from './UploadButton';

import type { Meta, StoryObj } from '@storybook/react-native';

const meta = {
  title: 'Features/Upload/UploadButton',
  component: UploadButton,
  tags: ['autodocs'],
  decorators: [
    (Story: React.ComponentType) => (
      <View style={{ padding: 20 }}>
        <Story />
      </View>
    ),
  ],
  argTypes: {
    status: {
      control: 'select',
      options: Object.values(UploadStatus),
      description: 'Current upload status',
    },
    progress: {
      control: { type: 'range', min: 0, max: 100, step: 1 },
      description: 'Upload progress percentage',
    },
    text: {
      control: 'text',
      description: 'Button text override',
    },
    disabled: {
      control: 'boolean',
      description: 'Whether button is disabled',
    },
  },
} satisfies Meta<typeof UploadButton>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Default idle state - ready to upload
 */
export const Idle: Story = {
  args: {
    status: UploadStatus.IDLE,
    progress: 0,
    text: 'Upload',
    disabled: false,
    onPress: () => {
      // eslint-disable-next-line no-console
      console.log('Upload pressed');
    },
  },
};

/**
 * Preprocessing state - preparing image before upload
 */
export const Preprocessing: Story = {
  args: {
    status: UploadStatus.PREPROCESSING,
    progress: 10,
    onPress: () => {
      // eslint-disable-next-line no-console
      console.log('Upload in progress');
    },
  },
};

/**
 * Requesting presigned URL state
 */
export const RequestingPresign: Story = {
  args: {
    status: UploadStatus.REQUESTING_PRESIGN,
    progress: 20,
    onPress: () => {
      // eslint-disable-next-line no-console
      console.log('Requesting presign');
    },
  },
};

/**
 * Uploading state with progress
 */
export const Uploading: Story = {
  args: {
    status: UploadStatus.UPLOADING,
    progress: 45,
    onPress: () => {
      // eslint-disable-next-line no-console
      console.log('Uploading');
    },
  },
};

/**
 * Uploading at 75%
 */
export const UploadingAlmost: Story = {
  args: {
    status: UploadStatus.UPLOADING,
    progress: 75,
    onPress: () => {
      // eslint-disable-next-line no-console
      console.log('Almost done');
    },
  },
};

/**
 * Paused state - network issues or user action
 */
export const Paused: Story = {
  args: {
    status: UploadStatus.PAUSED,
    progress: 60,
    onPress: () => {
      // eslint-disable-next-line no-console
      console.log('Resume pressed');
    },
  },
};

/**
 * Success state - upload completed
 */
export const Success: Story = {
  args: {
    status: UploadStatus.SUCCESS,
    progress: 100,
    onPress: () => {
      // eslint-disable-next-line no-console
      console.log('Success acknowledged');
    },
  },
};

/**
 * Error state - upload failed
 */
export const Error: Story = {
  args: {
    status: UploadStatus.ERROR,
    progress: 30,
    onPress: () => {
      // eslint-disable-next-line no-console
      console.log('Retry pressed');
    },
  },
};

/**
 * Disabled state
 */
export const Disabled: Story = {
  args: {
    status: UploadStatus.IDLE,
    progress: 0,
    text: 'Upload',
    disabled: true,
    onPress: () => {
      // eslint-disable-next-line no-console
      console.log('Should not fire');
    },
  },
};

/**
 * Custom text override
 */
export const CustomText: Story = {
  args: {
    status: UploadStatus.IDLE,
    progress: 0,
    text: 'Choose Photo',
    disabled: false,
    onPress: () => {
      // eslint-disable-next-line no-console
      console.log('Custom action');
    },
  },
};
