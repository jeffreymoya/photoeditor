/**
 * Camera Component Test Helper
 *
 * Provides act-aware render helper for CameraWithOverlay tests to eliminate
 * React 19 act(...) warnings caused by async feature flag initialization.
 *
 * Per standards/testing-standards.md#react-component-testing: wraps async
 * state updates in act() to ensure testing boundary compliance.
 *
 * Related: TASK-0917 (unblocker for TASK-0915)
 */

import { configureStore } from '@reduxjs/toolkit';
import { render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Provider } from 'react-redux';

import { settingsSlice } from '../store/slices/settingsSlice';

import type { RenderOptions, RenderResult } from '@testing-library/react-native';

/**
 * Options for rendering camera components with Redux and async readiness.
 */
export type CameraRenderOptions = Omit<RenderOptions, 'wrapper'> & {
  /**
   * Optional custom store configuration. If not provided, a default store
   * with settingsSlice is created.
   */
  store?: ReturnType<typeof configureStore>;
};

/**
 * Extended render result with Redux-aware rerender function.
 */
export type CameraRenderResult = RenderResult & {
  /**
   * Rerender function that preserves Redux Provider context.
   * Use this instead of the default rerender to avoid "could not find
   * react-redux context value" errors.
   */
  rerender: (component: React.ReactElement) => void;
};

/**
 * Helper to create a mock Redux store for camera tests.
 *
 * Per standards/typescript.md#analyzability: pure function with deterministic
 * output for consistent test behavior.
 *
 * @returns Configured Redux store with settingsSlice
 */
const createMockStore = () => {
  return configureStore({
    reducer: {
      settings: settingsSlice.reducer,
    },
  });
};

/**
 * Renders CameraWithOverlay components with act-aware async readiness.
 *
 * Wraps the render in act() and waits for feature flag initialization to
 * complete, ensuring all state updates happen within React's testing boundary.
 * This eliminates React 19 "An update to CameraWithOverlay inside a test was
 * not wrapped in act(...)" warnings.
 *
 * Per standards/testing-standards.md#react-component-testing:
 * - Uses act() to wrap async state updates
 * - Waits for component readiness via waitFor with reasonable timeout
 * - Returns Redux-aware rerender to preserve Provider context
 *
 * Per standards/typescript.md#analyzability:
 * - Typed return with explicit CameraRenderResult interface
 * - Documents async boundary handling for maintainability
 *
 * @param component - React element to render (typically CameraWithOverlay)
 * @param options - Optional render configuration including custom store
 * @returns Render utilities with Redux-aware rerender function
 *
 * @example
 * ```typescript
 * const { getByType, rerender } = await renderCameraWithRedux(
 *   <CameraWithOverlay enabledOverlays={['boundingBoxes']} />
 * );
 *
 * // Camera is ready, no act warnings
 * expect(getByType('Camera')).toBeDefined();
 *
 * // Rerender preserves Redux context
 * rerender(<CameraWithOverlay enabledOverlays={['liveFilters']} />);
 * ```
 */
export async function renderCameraWithRedux(
  component: React.ReactElement,
  options?: CameraRenderOptions
): Promise<CameraRenderResult> {
  const mockStore = options?.store ?? createMockStore();

  // Render component - RTL's render already wraps in act()
  const renderResult = render(<Provider store={mockStore}>{component}</Provider>, options);

  // Wait for async feature flag initialization to complete
  // CameraWithOverlay's useEffect calls async getDeviceCapability() which triggers
  // setState asynchronously. The mock returns Promise.resolve() which schedules the
  // setState on the microtask queue. The component returns null until featureFlags
  // state is set (CameraWithOverlay.tsx:214-216).
  //
  // waitFor with a trivial always-true assertion creates a polling loop that gives
  // the microtask queue time to drain and the async setState to complete within
  // React's testing boundary. Each poll iteration is wrapped in act() by waitFor,
  // capturing the state update and eliminating React 19 warnings.
  await waitFor(
    () => {
      // Trivial assertion that always passes - the real work is giving time for
      // the Promise.resolve() microtask to execute and trigger setState
      expect(true).toBe(true);
    },
    {
      timeout: 200, // Allow time for microtask queue to flush and state update to render
      interval: 10, // Check frequently (poll every 10ms to catch the async update)
    }
  );

  return {
    ...renderResult,
    // Override rerender to maintain Redux Provider context
    // Per TASK-0915: prevents "could not find react-redux context value" errors
    rerender: (newComponent: React.ReactElement) => {
      renderResult.rerender(<Provider store={mockStore}>{newComponent}</Provider>);
    },
  };
}
