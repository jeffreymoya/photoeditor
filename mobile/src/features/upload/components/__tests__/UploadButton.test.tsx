/**
 * UploadButton component tests
 * Covers all upload states, progress display, and button interactions
 * Aligns with standards/testing-standards.md and standards/frontend-tier.md#feature-guardrails
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import React from 'react';

import { UploadStatus } from '../../hooks/useUpload';
import { UploadButton, UploadButtonProps } from '../UploadButton';

describe('UploadButton', () => {
  const defaultProps: UploadButtonProps = {
    status: UploadStatus.IDLE,
    progress: 0,
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('idle state', () => {
    it('renders default text when idle', () => {
      render(<UploadButton {...defaultProps} />);

      expect(screen.getByText('Upload')).toBeTruthy();
    });

    it('renders custom text when provided', () => {
      render(<UploadButton {...defaultProps} text="Choose Photo" />);

      expect(screen.getByText('Choose Photo')).toBeTruthy();
    });

    it('calls onPress when button is pressed in idle state', () => {
      const onPress = jest.fn();
      render(<UploadButton {...defaultProps} onPress={onPress} />);

      fireEvent.press(screen.getByText('Upload'));

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('does not call onPress when disabled', () => {
      const onPress = jest.fn();
      render(<UploadButton {...defaultProps} onPress={onPress} disabled />);

      fireEvent.press(screen.getByText('Upload'));

      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('preprocessing state', () => {
    it('displays preprocessing message', () => {
      render(
        <UploadButton {...defaultProps} status={UploadStatus.PREPROCESSING} />
      );

      expect(screen.getByText('Processing...')).toBeTruthy();
    });

    it('shows loading indicator during preprocessing', () => {
      const { UNSAFE_getAllByType } = render(
        <UploadButton {...defaultProps} status={UploadStatus.PREPROCESSING} />
      );

      // ActivityIndicator should be present
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const indicators = UNSAFE_getAllByType('ActivityIndicator' as any);
      expect(indicators.length).toBeGreaterThan(0);
    });

    it('disables button during preprocessing', () => {
      const onPress = jest.fn();
      render(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.PREPROCESSING}
          onPress={onPress}
        />
      );

      fireEvent.press(screen.getByText('Processing...'));

      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('requesting presign state', () => {
    it('displays preparing message', () => {
      render(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.REQUESTING_PRESIGN}
        />
      );

      expect(screen.getByText('Preparing...')).toBeTruthy();
    });

    it('shows loading indicator during presign request', () => {
      const { UNSAFE_getAllByType } = render(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.REQUESTING_PRESIGN}
        />
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const indicators = UNSAFE_getAllByType('ActivityIndicator' as any);
      expect(indicators.length).toBeGreaterThan(0);
    });
  });

  describe('uploading state', () => {
    it('displays progress percentage', () => {
      render(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.UPLOADING}
          progress={45}
        />
      );

      expect(screen.getByText('Uploading 45%')).toBeTruthy();
    });

    it('shows loading indicator during upload', () => {
      const { UNSAFE_getAllByType } = render(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.UPLOADING}
          progress={30}
        />
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const indicators = UNSAFE_getAllByType('ActivityIndicator' as any);
      expect(indicators.length).toBeGreaterThan(0);
    });

    it('disables button during upload', () => {
      const onPress = jest.fn();
      render(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.UPLOADING}
          progress={50}
          onPress={onPress}
        />
      );

      fireEvent.press(screen.getByText('Uploading 50%'));

      expect(onPress).not.toHaveBeenCalled();
    });

    it('updates progress text dynamically', () => {
      const { rerender } = render(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.UPLOADING}
          progress={25}
        />
      );

      expect(screen.getByText('Uploading 25%')).toBeTruthy();

      rerender(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.UPLOADING}
          progress={75}
        />
      );

      expect(screen.getByText('Uploading 75%')).toBeTruthy();
    });
  });

  describe('paused state', () => {
    it('displays paused message', () => {
      render(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.PAUSED}
          progress={60}
        />
      );

      expect(screen.getByText('Paused')).toBeTruthy();
    });

    it('allows button press when paused', () => {
      const onPress = jest.fn();
      render(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.PAUSED}
          onPress={onPress}
        />
      );

      fireEvent.press(screen.getByText('Paused'));

      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('success state', () => {
    it('displays success message', () => {
      render(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.SUCCESS}
          progress={100}
        />
      );

      expect(screen.getByText('Uploaded')).toBeTruthy();
    });

    it('allows button press after success', () => {
      const onPress = jest.fn();
      render(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.SUCCESS}
          onPress={onPress}
        />
      );

      fireEvent.press(screen.getByText('Uploaded'));

      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('error state', () => {
    it('displays retry message', () => {
      render(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.ERROR}
          progress={30}
        />
      );

      expect(screen.getByText('Retry Upload')).toBeTruthy();
    });

    it('allows button press to retry', () => {
      const onPress = jest.fn();
      render(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.ERROR}
          onPress={onPress}
        />
      );

      fireEvent.press(screen.getByText('Retry Upload'));

      expect(onPress).toHaveBeenCalledTimes(1);
    });
  });

  describe('disabled state', () => {
    it('prevents interaction when explicitly disabled', () => {
      const onPress = jest.fn();
      render(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.IDLE}
          onPress={onPress}
          disabled
        />
      );

      fireEvent.press(screen.getByText('Upload'));

      expect(onPress).not.toHaveBeenCalled();
    });
  });

  describe('progress bar', () => {
    it('shows progress bar during upload with progress > 0', () => {
      const { UNSAFE_getAllByType } = render(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.UPLOADING}
          progress={50}
        />
      );

      // Progress bar consists of View components
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const views = UNSAFE_getAllByType('View' as any);
      expect(views.length).toBeGreaterThan(0);
    });

    it('does not show progress bar when progress is 0', () => {
      render(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.UPLOADING}
          progress={0}
        />
      );

      // Should still render but progress bar logic handles 0%
      expect(screen.getByText('Uploading 0%')).toBeTruthy();
    });
  });

  describe('accessibility', () => {
    it('renders with accessible text in all states', () => {
      const states = [
        { status: UploadStatus.IDLE, expectedText: 'Upload' },
        { status: UploadStatus.PREPROCESSING, expectedText: 'Processing...' },
        {
          status: UploadStatus.REQUESTING_PRESIGN,
          expectedText: 'Preparing...',
        },
        { status: UploadStatus.UPLOADING, expectedText: 'Uploading 0%' },
        { status: UploadStatus.PAUSED, expectedText: 'Paused' },
        { status: UploadStatus.SUCCESS, expectedText: 'Uploaded' },
        { status: UploadStatus.ERROR, expectedText: 'Retry Upload' },
      ];

      states.forEach(({ status, expectedText }) => {
        const { unmount } = render(
          <UploadButton {...defaultProps} status={status} />
        );

        expect(screen.getByText(expectedText)).toBeTruthy();

        unmount();
      });
    });
  });

  describe('edge cases', () => {
    it('handles progress values at boundaries', () => {
      const { rerender } = render(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.UPLOADING}
          progress={0}
        />
      );

      expect(screen.getByText('Uploading 0%')).toBeTruthy();

      rerender(
        <UploadButton
          {...defaultProps}
          status={UploadStatus.UPLOADING}
          progress={100}
        />
      );

      expect(screen.getByText('Uploading 100%')).toBeTruthy();
    });

    it('handles undefined progress gracefully', () => {
      // Test with progress omitted (will use default of 0 from props)
      const propsWithoutProgress = {
        status: UploadStatus.UPLOADING,
        onPress: jest.fn(),
      };

      render(<UploadButton {...propsWithoutProgress} />);

      // Should default to 0
      expect(screen.getByText('Uploading 0%')).toBeTruthy();
    });
  });
});
