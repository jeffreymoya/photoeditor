/**
 * Feature Flags Mock for Tests
 *
 * Provides deterministic mock helpers for device capability and feature flag tests.
 * Resolves async calls synchronously to prevent timing gaps in component tests.
 *
 * Per standards/testing-standards.md#react-component-testing:
 * - Stub platform modules at boundaries for deterministic CI runs
 * - Use explicit helpers for test-specific overrides with inline documentation
 *
 * Per TASK-0915: Async readiness pattern for CameraWithOverlay tests requires
 * mocks that resolve predictably without introducing race conditions.
 *
 * @module utils/__mocks__/featureFlags
 */

import type { DeviceCapability, FrameProcessorFeatureFlags } from '../featureFlags';

/**
 * Default mock device capability (iOS, not capable - per ADR-0011)
 */
const DEFAULT_DEVICE_CAPABILITY: DeviceCapability = {
  isOnAllowlist: false,
  meetsMinimumSpecs: false,
  platform: 'ios',
  deviceModel: null,
  apiLevel: null,
  totalMemoryGB: null,
  reason: 'iOS support deferred to post-pilot phase (ADR-0011)',
};

/**
 * Android device capability preset (on allowlist, meets specs)
 * Use this for testing frame processor enablement scenarios.
 */
export const ANDROID_CAPABLE_DEVICE: DeviceCapability = {
  isOnAllowlist: true,
  meetsMinimumSpecs: true,
  platform: 'android',
  deviceModel: 'Pixel 6',
  apiLevel: 31,
  totalMemoryGB: 8,
  reason: 'Device on allowlist and meets minimum specs',
};

/**
 * Android device capability preset (not on allowlist, meets specs)
 * Use this for testing pilot restrictions.
 */
export const ANDROID_CAPABLE_NOT_ALLOWLISTED: DeviceCapability = {
  isOnAllowlist: false,
  meetsMinimumSpecs: true,
  platform: 'android',
  deviceModel: 'Generic Android Device',
  apiLevel: 30,
  totalMemoryGB: 6,
  reason: 'Device meets minimum specs but not on allowlist (model: Generic Android Device)',
};

/**
 * Android device capability preset (on allowlist, does not meet specs)
 * Use this for testing minimum spec enforcement.
 */
export const ANDROID_ALLOWLISTED_NOT_CAPABLE: DeviceCapability = {
  isOnAllowlist: true,
  meetsMinimumSpecs: false,
  platform: 'android',
  deviceModel: 'Pixel 4',
  apiLevel: 28,
  totalMemoryGB: 3,
  reason: 'Device on allowlist but does not meet minimum specs (API 28, 3.0GB RAM)',
};

/**
 * Internal mock state for controlling async behavior in tests
 */
let mockDeviceCapability: DeviceCapability = DEFAULT_DEVICE_CAPABILITY;

/**
 * Set the mock device capability for subsequent getDeviceCapability calls.
 *
 * Helper for test-specific overrides. Call this in beforeEach to control
 * which device capability the component receives.
 *
 * @example
 * ```typescript
 * beforeEach(() => {
 *   setMockDeviceCapability(ANDROID_CAPABLE_DEVICE);
 * });
 * ```
 *
 * @param capability - Device capability to return from getDeviceCapability
 */
export const setMockDeviceCapability = (capability: DeviceCapability): void => {
  mockDeviceCapability = capability;
};

/**
 * Reset mock device capability to default (iOS, not capable).
 *
 * Call this in afterEach to prevent state leakage between tests per
 * standards/testing-standards.md#test-authoring-guidelines.
 *
 * @example
 * ```typescript
 * afterEach(() => {
 *   resetMockDeviceCapability();
 * });
 * ```
 */
export const resetMockDeviceCapability = (): void => {
  mockDeviceCapability = DEFAULT_DEVICE_CAPABILITY;
};

/**
 * Mock implementation of getDeviceCapability.
 *
 * Returns a resolved Promise to enable deterministic testing.
 * The Promise.resolve() ensures the value is available on the next microtask,
 * which React Testing Library's waitFor handles correctly.
 *
 * Use setMockDeviceCapability() to control the returned capability.
 */
export const getDeviceCapability = jest.fn(
  async (): Promise<DeviceCapability> => mockDeviceCapability
);

/**
 * Mock implementation of shouldEnableFrameProcessors.
 *
 * Mimics production logic: enabled only if user enabled AND device is Android AND capable.
 *
 * Pure function - no side effects, deterministic output for given inputs.
 */
export const shouldEnableFrameProcessors = jest.fn(
  (
    userEnabledOverride: boolean | null,
    deviceCapability: DeviceCapability
  ): FrameProcessorFeatureFlags => {
    const isDeviceCapable =
      deviceCapability.isOnAllowlist && deviceCapability.meetsMinimumSpecs;

    // User override takes precedence (pilot-friendly default: enabled if device capable)
    const isUserEnabled = userEnabledOverride !== null ? userEnabledOverride : isDeviceCapable;

    return {
      isEnabled: isUserEnabled && deviceCapability.platform === 'android',
      isDeviceCapable,
      isUserEnabled,
      deviceCapability,
    };
  }
);
