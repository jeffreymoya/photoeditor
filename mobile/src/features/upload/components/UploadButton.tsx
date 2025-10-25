/**
 * Upload button component with progress indicator
 * Uses ui-tokens for styling per STANDARDS.md line 161
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  View,
} from 'react-native';

import { colors, spacing, borderRadius, typography } from '@/lib/ui-tokens';

import { UploadStatus } from '../hooks/useUpload';

export interface UploadButtonProps {
  /**
   * Upload status to display appropriate state
   */
  status: UploadStatus;
  /**
   * Upload progress percentage (0-100)
   */
  progress?: number;
  /**
   * Button press handler
   */
  onPress: () => void;
  /**
   * Button text. Default: 'Upload'
   */
  text?: string;
  /**
   * Whether button is disabled
   */
  disabled?: boolean;
}

/**
 * Upload button with status-aware styling and progress
 */
export function UploadButton({
  status,
  progress = 0,
  onPress,
  text = 'Upload',
  disabled = false,
}: UploadButtonProps) {
  const isLoading = status === UploadStatus.PREPROCESSING ||
    status === UploadStatus.REQUESTING_PRESIGN ||
    status === UploadStatus.UPLOADING;

  const isPaused = status === UploadStatus.PAUSED;
  const isError = status === UploadStatus.ERROR;
  const isSuccess = status === UploadStatus.SUCCESS;

  const getButtonStyle = () => {
    if (disabled || isLoading) {
      return styles.buttonDisabled;
    }
    if (isError) {
      return styles.buttonError;
    }
    if (isSuccess) {
      return styles.buttonSuccess;
    }
    if (isPaused) {
      return styles.buttonWarning;
    }
    return styles.button;
  };

  const getButtonText = () => {
    if (isLoading) {
      if (status === UploadStatus.PREPROCESSING) {
        return 'Processing...';
      }
      if (status === UploadStatus.REQUESTING_PRESIGN) {
        return 'Preparing...';
      }
      if (status === UploadStatus.UPLOADING) {
        return `Uploading ${progress}%`;
      }
      return text;
    }
    if (isPaused) {
      return 'Paused';
    }
    if (isError) {
      return 'Retry Upload';
    }
    if (isSuccess) {
      return 'Uploaded';
    }
    return text;
  };

  return (
    <TouchableOpacity
      style={[styles.buttonBase, getButtonStyle()]}
      onPress={onPress}
      disabled={disabled || isLoading}
      activeOpacity={0.7}
    >
      {isLoading && (
        <ActivityIndicator
          size="small"
          color={colors.textInverse}
          style={styles.loader}
        />
      )}
      <Text style={styles.buttonText}>{getButtonText()}</Text>
      {isLoading && progress > 0 && (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  buttonBase: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    position: 'relative',
    overflow: 'hidden',
  },
  button: {
    backgroundColor: colors.primary,
  },
  buttonDisabled: {
    backgroundColor: colors.divider,
  },
  buttonError: {
    backgroundColor: colors.error,
  },
  buttonSuccess: {
    backgroundColor: colors.success,
  },
  buttonWarning: {
    backgroundColor: colors.warning,
  },
  buttonText: {
    color: colors.textInverse,
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  loader: {
    marginRight: spacing.sm,
  },
  progressBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.textInverse,
  },
});
