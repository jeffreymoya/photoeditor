/**
 * Feature Flags Module
 *
 * Manages feature enablement for VisionCamera Skia frame processors with:
 * - Android device allowlist (API 29+, 4GB+ RAM)
 * - User toggle for pilot testers
 * - Pilot-friendly defaults (enabled by default for allowlist devices)
 *
 * Per ADR-0011 (Android-first pilot): iOS support explicitly deferred to post-pilot phase.
 * Per ADR-0012 (Skia integration): Feature flags provide rollback control during pilot.
 *
 * Standards alignment:
 * - standards/frontend-tier.md#state--logic-layer: Feature flag patterns
 * - standards/typescript.md#analyzability: Pure functions for device checks
 * - standards/typescript.md#modifiability: Edge-level flags with expiry
 *
 * @module utils/featureFlags
 */

import * as Device from 'expo-device';
import { Platform } from 'react-native';

/**
 * Android API levels for allowlist criteria
 */
const ANDROID_API_LEVEL_29 = 29; // Android 10 (Q)

/**
 * Minimum RAM in GB for allowlist (conservative threshold)
 */
const MIN_RAM_GB = 4;

/**
 * Android device allowlist seeded conservatively for pilot phase.
 *
 * Criteria (per task TASK-0911E):
 * - API 29+ (Android 10+)
 * - 4GB+ RAM
 * - Modern devices with known-good GPU performance
 *
 * Device families included:
 * - Google Pixel 4+ (Pixel 4, 4 XL, 4a, 5, 6, 7, 8, 9)
 * - Samsung Galaxy S10+ (S10, S10+, S10e, S20, S21, S22, S23, S24)
 * - OnePlus 7+ (7, 7T, 8, 9, 10, 11, 12)
 * - Xiaomi Mi 9+ (Mi 9, 10, 11, 12, 13, 14)
 *
 * Allowlist expansion driven by frame budget telemetry (frameBudgetMonitor.ts).
 *
 * NOTE: iOS allowlist explicitly deferred per ADR-0011 Android-first strategy.
 */
const ANDROID_DEVICE_ALLOWLIST: readonly string[] = [
  // Google Pixel 4 series (API 29+, 6GB RAM)
  'Pixel 4',
  'Pixel 4 XL',
  'Pixel 4a',
  'Pixel 4a (5G)',

  // Google Pixel 5+ (API 30+, 8GB+ RAM)
  'Pixel 5',
  'Pixel 5a',
  'Pixel 6',
  'Pixel 6 Pro',
  'Pixel 6a',
  'Pixel 7',
  'Pixel 7 Pro',
  'Pixel 7a',
  'Pixel 8',
  'Pixel 8 Pro',
  'Pixel 8a',
  'Pixel 9',
  'Pixel 9 Pro',
  'Pixel 9 Pro XL',

  // Samsung Galaxy S10 series (API 28+, 6-12GB RAM)
  'SM-G973', // S10
  'SM-G975', // S10+
  'SM-G970', // S10e

  // Samsung Galaxy S20 series (API 29+, 8-16GB RAM)
  'SM-G980', // S20
  'SM-G981', // S20 5G
  'SM-G985', // S20+
  'SM-G986', // S20+ 5G
  'SM-G988', // S20 Ultra

  // Samsung Galaxy S21 series (API 30+, 8-16GB RAM)
  'SM-G991', // S21
  'SM-G996', // S21+
  'SM-G998', // S21 Ultra

  // Samsung Galaxy S22 series (API 31+, 8-12GB RAM)
  'SM-S901', // S22
  'SM-S906', // S22+
  'SM-S908', // S22 Ultra

  // Samsung Galaxy S23 series (API 33+, 8-12GB RAM)
  'SM-S911', // S23
  'SM-S916', // S23+
  'SM-S918', // S23 Ultra

  // Samsung Galaxy S24 series (API 34+, 8-12GB RAM)
  'SM-S921', // S24
  'SM-S926', // S24+
  'SM-S928', // S24 Ultra

  // OnePlus 7 series (API 28+, 6-12GB RAM)
  'GM1900', // OnePlus 7
  'GM1901', // OnePlus 7
  'GM1903', // OnePlus 7
  'HD1900', // OnePlus 7T
  'HD1901', // OnePlus 7T
  'HD1903', // OnePlus 7T

  // OnePlus 8+ (API 29+, 8-12GB RAM)
  'IN2010', // OnePlus 8
  'IN2020', // OnePlus 8 Pro
  'KB2000', // OnePlus 9
  'LE2110', // OnePlus 9 Pro
  'NE2210', // OnePlus 10 Pro
  'PHB110', // OnePlus 11
  'CPH2581', // OnePlus 12

  // Xiaomi Mi 9+ (API 28+, 6-12GB RAM)
  'MI 9',
  'MI 9T',
  'MI 10',
  'MI 11',
  'MI 12',
  'MI 13',
  'MI 14',
  'Redmi K20 Pro',
  'Redmi K30 Pro',
  'Redmi K40 Pro',
];

/**
 * Device capability check result
 */
export type DeviceCapability = {
  readonly isOnAllowlist: boolean;
  readonly meetsMinimumSpecs: boolean;
  readonly platform: 'android' | 'ios' | 'other';
  readonly deviceModel: string | null;
  readonly apiLevel: number | null;
  readonly totalMemoryGB: number | null;
  readonly reason: string;
};

/**
 * Feature flag state for camera frame processors
 */
export type FrameProcessorFeatureFlags = {
  readonly isEnabled: boolean;
  readonly isDeviceCapable: boolean;
  readonly isUserEnabled: boolean;
  readonly deviceCapability: DeviceCapability;
};

/**
 * Check if device meets minimum specifications for frame processors.
 *
 * Criteria:
 * - Android API 29+ (Android 10+)
 * - 4GB+ RAM
 *
 * Pure function per standards/typescript.md#analyzability.
 *
 * @param apiLevel - Android API level (null for non-Android)
 * @param totalMemoryGB - Total device RAM in GB (null if unavailable)
 * @returns True if device meets minimum specs, false otherwise
 */
export const meetsMinimumSpecs = (
  apiLevel: number | null,
  totalMemoryGB: number | null
): boolean => {
  if (apiLevel === null || totalMemoryGB === null) {
    return false;
  }

  return apiLevel >= ANDROID_API_LEVEL_29 && totalMemoryGB >= MIN_RAM_GB;
};

/**
 * Check if device model is on the allowlist.
 *
 * Performs case-insensitive substring matching to handle device model variations.
 * Example: "Pixel 4" matches "Google Pixel 4", "pixel 4", "Pixel 4 (coral)"
 *
 * Pure function per standards/typescript.md#analyzability.
 *
 * @param deviceModel - Device model string (null if unavailable)
 * @param allowlist - Array of allowed device model patterns
 * @returns True if device is on allowlist, false otherwise
 */
export const isDeviceOnAllowlist = (
  deviceModel: string | null,
  allowlist: readonly string[]
): boolean => {
  if (!deviceModel) {
    return false;
  }

  const normalizedModel = deviceModel.toLowerCase();

  return allowlist.some((pattern) =>
    normalizedModel.includes(pattern.toLowerCase())
  );
};

/**
 * Format device specs string.
 *
 * Pure function per standards/typescript.md#analyzability.
 */
const formatDeviceSpecs = (
  apiLevel: number | null,
  totalMemoryGB: number | null
): string => {
  const api = apiLevel ?? 'unknown';
  const ram = totalMemoryGB?.toFixed(1) ?? 'unknown';
  return `API ${api}, ${ram}GB RAM`;
};

/**
 * Format device model string.
 *
 * Pure function per standards/typescript.md#analyzability.
 */
const formatDeviceModel = (deviceModel: string | null): string => {
  return deviceModel ?? 'unknown';
};

/**
 * Build reason string for device capability.
 *
 * Pure function per standards/typescript.md#analyzability.
 */
const buildDeviceCapabilityReason = (
  isOnAllowlist: boolean,
  meetsSpecs: boolean,
  deviceModel: string | null,
  apiLevel: number | null,
  totalMemoryGB: number | null
): string => {
  if (isOnAllowlist && meetsSpecs) {
    return 'Device on allowlist and meets minimum specs';
  }

  if (isOnAllowlist) {
    return `Device on allowlist but does not meet minimum specs (${formatDeviceSpecs(apiLevel, totalMemoryGB)})`;
  }

  if (meetsSpecs) {
    return `Device meets minimum specs but not on allowlist (model: ${formatDeviceModel(deviceModel)})`;
  }

  return `Device does not meet requirements (model: ${formatDeviceModel(deviceModel)}, ${formatDeviceSpecs(apiLevel, totalMemoryGB)})`;
};

/**
 * Get Android device capability information.
 *
 * Impure function (reads device state via expo-device).
 *
 * @returns Android device capability
 */
const getAndroidDeviceCapability = (): DeviceCapability => {
  const deviceModel = Device.modelName;
  const apiLevel = Device.platformApiLevel;
  const totalMemoryGB = Device.totalMemory ? Device.totalMemory / (1024 ** 3) : null;

  const isOnAllowlist = isDeviceOnAllowlist(deviceModel, ANDROID_DEVICE_ALLOWLIST);
  const meetsSpecs = meetsMinimumSpecs(apiLevel, totalMemoryGB);
  const reason = buildDeviceCapabilityReason(isOnAllowlist, meetsSpecs, deviceModel, apiLevel, totalMemoryGB);

  return {
    isOnAllowlist,
    meetsMinimumSpecs: meetsSpecs,
    platform: 'android',
    deviceModel,
    apiLevel,
    totalMemoryGB,
    reason,
  };
};

/**
 * Get device capability information for frame processors.
 *
 * Checks:
 * 1. Device model against allowlist
 * 2. Minimum specifications (API level, RAM)
 *
 * Android-only for pilot phase per ADR-0011. iOS support deferred.
 *
 * Impure function (reads device state via expo-device).
 *
 * @returns Device capability information
 */
export const getDeviceCapability = async (): Promise<DeviceCapability> => {
  const platform = Platform.OS;

  // iOS support explicitly deferred per ADR-0011
  if (platform === 'ios') {
    return {
      isOnAllowlist: false,
      meetsMinimumSpecs: false,
      platform: 'ios',
      deviceModel: null,
      apiLevel: null,
      totalMemoryGB: null,
      reason: 'iOS support deferred to post-pilot phase (ADR-0011)',
    };
  }

  // Non-Android/iOS platforms not supported
  if (platform !== 'android') {
    return {
      isOnAllowlist: false,
      meetsMinimumSpecs: false,
      platform: 'other',
      deviceModel: null,
      apiLevel: null,
      totalMemoryGB: null,
      reason: `Platform ${platform} not supported for frame processors`,
    };
  }

  // Android device capability check
  return getAndroidDeviceCapability();
};

/**
 * Check if camera frame processors should be enabled.
 *
 * Decision logic (pilot-friendly defaults per TASK-0911E):
 * 1. If device on allowlist → enabled by default (user can disable)
 * 2. If device not on allowlist → disabled by default (user can enable with warning)
 *
 * User toggle always takes precedence over device capability.
 *
 * @param userEnabledOverride - User's explicit preference (null = use default)
 * @param deviceCapability - Device capability information
 * @returns Feature flag state
 */
export const shouldEnableFrameProcessors = (
  userEnabledOverride: boolean | null,
  deviceCapability: DeviceCapability
): FrameProcessorFeatureFlags => {
  const isDeviceCapable = deviceCapability.isOnAllowlist && deviceCapability.meetsMinimumSpecs;

  // User override takes precedence
  const isUserEnabled = userEnabledOverride !== null
    ? userEnabledOverride
    : isDeviceCapable; // Pilot-friendly default: enabled if device capable

  return {
    isEnabled: isUserEnabled && deviceCapability.platform === 'android',
    isDeviceCapable,
    isUserEnabled,
    deviceCapability,
  };
};
