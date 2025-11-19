/**
 * CameraWithOverlay Component
 *
 * Wraps VisionCamera with Skia frame processors for GPU-accelerated overlays.
 * Supports bounding boxes, live filters, and AI editing previews.
 *
 * Component follows standards/frontend-tier.md#ui-components-layer patterns:
 * - Named exports only (no default exports)
 * - Props interface with readonly fields
 * - Exported via /public barrel
 *
 * @module features/camera/CameraWithOverlay
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Camera, useCameraDevice, useSkiaFrameProcessor } from 'react-native-vision-camera';
import { useSelector } from 'react-redux';

import { colors, spacing, typography } from '@/lib/ui-tokens';
import type { RootState } from '@/store';
import { getDeviceCapability, shouldEnableFrameProcessors } from '@/utils/featureFlags';
import type { FrameProcessorFeatureFlags } from '@/utils/featureFlags';

import { monitorFrameProcessing } from './frameBudgetMonitor';
import { applyCombinedOverlays } from './frameProcessors';

import type {
  BoundingBox,
  FilterParams,
  OverlayConfig,
  CombinedOverlayOptions,
} from './frameProcessors';



/**
 * Camera position type
 */
export type CameraPosition = 'front' | 'back';

/**
 * Overlay type flags
 */
export type OverlayType = 'boundingBoxes' | 'liveFilters' | 'aiOverlay';

/**
 * CameraWithOverlay component props
 */
export type CameraWithOverlayProps = {
  readonly style?: ViewStyle;
  readonly position?: CameraPosition;
  readonly enabledOverlays?: readonly OverlayType[];
  readonly boundingBoxes?: readonly BoundingBox[];
  readonly filterParams?: FilterParams;
  readonly overlayConfig?: OverlayConfig;
  readonly onError?: (error: Error) => void;
};

/**
 * Camera component with GPU-accelerated Skia overlays
 *
 * Features:
 * - Bounding boxes for AI analysis preview
 * - Live filters (brightness, contrast, saturation)
 * - AI editing overlay compositing
 *
 * Performance:
 * - Frame processors run on camera thread via Reanimated worklets
 * - GPU-accelerated Skia rendering
 * - Overlays toggled via props (no re-renders)
 *
 * @example
 * ```tsx
 * <CameraWithOverlay
 *   position="back"
 *   enabledOverlays={['boundingBoxes', 'liveFilters']}
 *   boundingBoxes={[{ x: 100, y: 100, width: 200, height: 200, label: 'Face' }]}
 *   filterParams={{ brightness: 0.2, contrast: 1.1 }}
 * />
 * ```
 */
export const CameraWithOverlay: React.FC<CameraWithOverlayProps> = ({
  style,
  position = 'back',
  enabledOverlays = [],
  boundingBoxes = [],
  filterParams,
  overlayConfig,
  onError,
}) => {
  // Get camera device
  const device = useCameraDevice(position);

  // Get user's frame processor preference from Redux
  const userFrameProcessorEnabled = useSelector(
    (state: RootState) => state.settings.camera.frameProcessorsEnabled
  );

  // Feature flags state
  const [featureFlags, setFeatureFlags] = useState<FrameProcessorFeatureFlags | null>(null);

  // Initialize feature flags on mount
  useEffect(() => {
    // Telemetry: Track loading sentinel entry time
    const sentinelEntryTime = performance.now();

    const initFeatureFlags = async () => {
      const deviceCapability = await getDeviceCapability();
      const flags = shouldEnableFrameProcessors(userFrameProcessorEnabled, deviceCapability);
      setFeatureFlags(flags);

      // Telemetry: Calculate sentinel dwell time
      const sentinelExitTime = performance.now();
      const dwellTime = sentinelExitTime - sentinelEntryTime;

      // Log feature flag state on component mount per plan step 4
      console.warn('[CameraWithOverlay] Feature flags initialized', {
        isEnabled: flags.isEnabled,
        isDeviceCapable: flags.isDeviceCapable,
        isUserEnabled: flags.isUserEnabled,
        platform: flags.deviceCapability.platform,
        deviceModel: flags.deviceCapability.deviceModel,
        reason: flags.deviceCapability.reason,
        sentinelDwellTimeMs: dwellTime,
      });
    };

    void initFeatureFlags();
  }, [userFrameProcessorEnabled]);

  // Shared values for frame processor parameters (updated without re-renders)
  const overlayOptions = useSharedValue<CombinedOverlayOptions>({});

  // Build overlay options based on enabled overlays
  const computedOptions = useMemo((): CombinedOverlayOptions => {
    const result: CombinedOverlayOptions = {};

    if (enabledOverlays.includes('liveFilters') && filterParams) {
      Object.assign(result, { filters: filterParams });
    }

    if (enabledOverlays.includes('boundingBoxes') && boundingBoxes.length > 0) {
      Object.assign(result, { boxes: boundingBoxes });
    }

    if (enabledOverlays.includes('aiOverlay') && overlayConfig) {
      Object.assign(result, { overlay: overlayConfig });
    }

    return result;
  }, [enabledOverlays, boundingBoxes, filterParams, overlayConfig]);

  // Update shared value when options change
  useEffect(() => {
    overlayOptions.value = computedOptions;
  }, [computedOptions, overlayOptions]);

  // Frame processor with Skia overlays
  // Android-first implementation per ADR-0011 and ADR-0012
  // DrawableFrame extends both Frame and SkCanvas - render frame first, then draw overlays
  // Feature flag gated per TASK-0911E
  const frameProcessor = useSkiaFrameProcessor(
    (frame) => {
      'worklet';

      // Render the camera frame to the canvas first
      frame.render();

      // Apply combined overlays if feature flags allow and any are enabled
      // Feature flag check happens at component level (featureFlags state)
      // Frame processor only runs if enabled (via conditional below in Camera component)
      if (enabledOverlays.length > 0) {
        const options = overlayOptions.value;

        // Apply overlays with Skia canvas (frame acts as both Frame and SkCanvas)
        if (options.filters || options.boxes || options.overlay) {
          // Frame budget monitoring per TASK-0911E plan step 4
          const startTime = performance.now();

          applyCombinedOverlays(frame, frame, options);

          const endTime = performance.now();
          monitorFrameProcessing(startTime, endTime, 'combined');
        }
      }
    },
    [enabledOverlays, overlayOptions]
  );

  // Cleanup hook for Skia resources and frame processor disposal
  // Per ADR-0012 and VisionCamera best practices: keep Camera mounted, toggle isActive
  // Frame processor resources (Paint, Color, etc.) are worklet-scoped and auto-collected
  // Cleanup primarily ensures proper disposal on component unmount
  useEffect(() => {
    return () => {
      // Cleanup logic on unmount
      // Current implementation: Skia resources are worklet-scoped and auto-collected
      // No persistent resources requiring manual disposal at this time
      // This hook provides future extension point for resource cleanup if needed
    };
  }, []);

  // Error handler
  const handleError = useCallback(
    (error: Error) => {
      if (onError) {
        onError(error);
      } else {
        console.error('[CameraWithOverlay] Camera error:', error);
      }
    },
    [onError]
  );

  // No device available
  if (!device) {
    return null;
  }

  // Feature flags not yet initialized - show loading sentinel
  // Per TASK-0918: Follows SettingsScreen precedent from TASK-0914
  // Provides user feedback and observable loading state for tests
  if (!featureFlags) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text
          style={styles.loadingText}
          accessibilityRole="progressbar"
          testID="camera-loading-sentinel"
        >
          Loading camera settings...
        </Text>
      </View>
    );
  }

  // Check if frame processors should be enabled per feature flags
  // Per ADR-0011: Android-first pilot, iOS explicitly deferred
  // Per TASK-0911E: Feature flag gates frame processor enablement
  const shouldUseFrameProcessor = featureFlags.isEnabled && enabledOverlays.length > 0;

  // Build Camera props conditionally based on feature flags
  // exactOptionalPropertyTypes requires we omit undefined frameProcessor rather than pass undefined
  const cameraProps = shouldUseFrameProcessor
    ? {
        style: [styles.camera, style],
        device,
        isActive: true as const,
        frameProcessor,
        onError: handleError,
      }
    : {
        style: [styles.camera, style],
        device,
        isActive: true as const,
        onError: handleError,
      };

  return <Camera {...cameraProps} />;
};

const styles = StyleSheet.create({
  camera: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
  },
  loadingText: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
});
