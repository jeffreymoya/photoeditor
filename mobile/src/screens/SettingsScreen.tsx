import React, { useEffect, useState } from 'react';
import { Text, StyleSheet, View, Switch, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';

import { colors, spacing, typography } from '@/lib/ui-tokens';
import type { RootState } from '@/store';
import { setFrameProcessorsEnabled } from '@/store/slices/settingsSlice';
import { getDeviceCapability } from '@/utils/featureFlags';
import type { DeviceCapability } from '@/utils/featureFlags';

/**
 * SettingsScreen Component
 *
 * Displays app settings including camera frame processor toggle.
 * Per TASK-0911E plan step 5: User toggle with performance warning for non-allowlist devices.
 *
 * Standards alignment:
 * - standards/frontend-tier.md#ui-components-layer: Component patterns
 * - standards/frontend-tier.md#state--logic-layer: Redux state management
 */
export const SettingsScreen = () => {
  const dispatch = useDispatch();

  // Get current frame processor setting from Redux
  const frameProcessorsEnabled = useSelector(
    (state: RootState) => state.settings.camera.frameProcessorsEnabled
  );

  // Device capability state
  const [deviceCapability, setDeviceCapability] = useState<DeviceCapability | null>(null);

  // Initialize device capability on mount
  useEffect(() => {
    const initDeviceCapability = async () => {
      const capability = await getDeviceCapability();
      setDeviceCapability(capability);
    };

    void initDeviceCapability();
  }, []);

  // Handle toggle change
  const handleToggleChange = (value: boolean) => {
    // Show performance warning if enabling on non-allowlist device
    if (
      value &&
      deviceCapability &&
      !deviceCapability.isOnAllowlist &&
      deviceCapability.platform === 'android'
    ) {
      Alert.alert(
        'Performance Warning',
        'Your device is not on the recommended list for camera overlays. You may experience reduced performance or frame drops. Continue?',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Enable Anyway',
            onPress: () => {
              dispatch(setFrameProcessorsEnabled(value));
            },
          },
        ]
      );
    } else {
      dispatch(setFrameProcessorsEnabled(value));
    }
  };

  // Determine effective toggle state
  // null = use device default (allowlist devices enabled by default)
  const effectiveValue =
    frameProcessorsEnabled !== null
      ? frameProcessorsEnabled
      : deviceCapability?.isOnAllowlist ?? false;

  // Show loading state while device capability is being determined
  if (!deviceCapability) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Loading device information...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Configure your app preferences</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Camera</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Camera Overlays</Text>
            <Text style={styles.settingDescription}>
              {deviceCapability.platform === 'android'
                ? 'Enable AI-powered camera overlays with bounding boxes and live filters.'
                : 'Camera overlays are currently available on Android only (pilot phase).'}
            </Text>
            {deviceCapability.platform === 'android' && !deviceCapability.isOnAllowlist && (
              <Text style={styles.warningText}>
                Your device is not on the recommended list. Performance may vary.
              </Text>
            )}
            {deviceCapability.platform === 'android' && (
              <Text style={styles.deviceInfo}>
                Device: {deviceCapability.deviceModel ?? 'Unknown'}
                {'\n'}
                {deviceCapability.reason}
              </Text>
            )}
          </View>
          <Switch
            value={effectiveValue}
            onValueChange={handleToggleChange}
            disabled={deviceCapability.platform !== 'android'}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  settingInfo: {
    flex: 1,
    marginRight: spacing.md,
  },
  settingLabel: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.medium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  settingDescription: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  warningText: {
    fontSize: typography.sizes.sm,
    color: colors.warning,
    marginBottom: spacing.xs,
  },
  deviceInfo: {
    fontSize: typography.sizes.xs,
    color: colors.textTertiary,
    fontFamily: 'monospace',
  },
});