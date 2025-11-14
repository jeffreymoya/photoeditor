import { configureStore } from '@reduxjs/toolkit';
import { TamaguiProvider } from '@tamagui/core';
import { render, type RenderOptions, type RenderResult, waitFor, screen } from '@testing-library/react-native';
import React, { type ReactElement } from 'react';
import { Provider } from 'react-redux';

import config from '../../tamagui.config';
import { imageSlice } from '../store/slices/imageSlice';
import { jobSlice } from '../store/slices/jobSlice';
import { settingsSlice } from '../store/slices/settingsSlice';
import { uploadApi } from '../store/uploadApi';

/**
 * Shared render helper that injects the TamaguiProvider so Tamagui primitives
 * have the expected theme context during tests.
 */
export const renderWithProviders = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) =>
  render(
    <TamaguiProvider config={config} defaultTheme="light">
      {ui}
    </TamaguiProvider>,
    options
  );

/**
 * Options for rendering components with Redux Provider.
 *
 * Per standards/typescript.md#analyzability: typed interface extending RTL's RenderOptions
 * to maintain strong typing and enable optional store configuration.
 */
export type RenderWithReduxOptions = Omit<RenderOptions, 'wrapper'> & {
  /**
   * Optional custom Redux store configuration. If not provided, a default store
   * with all slices (image, job, settings, uploadApi) is created.
   */
  store?: ReturnType<typeof configureStore>;
};

/**
 * Extended render result with Redux-aware rerender function and store access.
 *
 * Per standards/testing-standards.md#react-component-testing: preserves Provider context
 * across rerenders to ensure Redux-connected components remain functional during multi-render
 * test scenarios (e.g., prop changes, state updates).
 */
export type RenderWithReduxResult = RenderResult & {
  /**
   * Rerender function that preserves Redux Provider context.
   *
   * Unlike React Testing Library's default rerender which strips away the Provider wrapper,
   * this version re-wraps the new component in <Provider store={store}> to maintain
   * Redux context across rerenders.
   *
   * Per standards/frontend-tier.md#state--logic-layer: prevents "could not find react-redux
   * context value" errors when testing components that use useSelector or dispatch hooks.
   *
   * @param component - New React element to render (will be wrapped in Provider)
   *
   * @example
   * ```typescript
   * const { rerender } = renderWithRedux(<MyComponent prop="initial" />);
   * // Component has Redux access
   *
   * rerender(<MyComponent prop="updated" />);
   * // Component still has Redux access (Provider preserved)
   * ```
   */
  rerender: (component: ReactElement) => void;

  /**
   * Redux store instance used for this render.
   * Useful for inspecting state or dispatching actions in tests.
   */
  store: ReturnType<typeof configureStore>;
};

/**
 * Helper to create a mock Redux store for tests.
 *
 * Per standards/typescript.md#analyzability: pure function with deterministic
 * output for consistent test behavior. Each invocation creates a fresh store
 * instance to avoid cross-test contamination.
 *
 * @returns Configured Redux store with all production slices (image, job, settings, uploadApi)
 */
const createMockStore = () => {
  return configureStore({
    reducer: {
      image: imageSlice.reducer,
      job: jobSlice.reducer,
      settings: settingsSlice.reducer,
      [uploadApi.reducerPath]: uploadApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActions: ['image/setSelectedImage'],
          ignoredPaths: ['image.selectedImage'],
        },
      }).concat(uploadApi.middleware),
  });
};

/**
 * Renders React Native components with Redux Provider context.
 *
 * Wraps the component in <Provider store={store}> and returns a rerender function
 * that preserves the Provider wrapper, preventing "could not find react-redux context
 * value" errors during multi-render test scenarios.
 *
 * Per standards/testing-standards.md#react-component-testing: ensures Redux-connected
 * components can use useSelector/dispatch hooks across rerenders while maintaining
 * deterministic behavior for parallel Jest runs.
 *
 * Per standards/frontend-tier.md#state--logic-layer: maintains Redux provider layering
 * compliance with Redux Toolkit patterns and selector-first architecture.
 *
 * Per standards/typescript.md#maintainability-pillars--concrete-heuristics: typed
 * signatures with explicit return types, TSDoc documentation, and no hidden state.
 *
 * **When to use this helper vs. camera-specific helper:**
 * - Use `renderWithRedux` for general Redux-connected components (screens, settings, etc.)
 * - Use `renderCameraWithRedux` from `test-utils/cameraRenderHelper` for CameraWithOverlay
 *   tests that require async feature flag readiness waiting
 *
 * **Usage pattern:**
 * ```typescript
 * import { renderWithRedux } from '@/__tests__/test-utils';
 *
 * const { getByText, rerender, store } = renderWithRedux(<MyScreen />);
 * expect(getByText('Hello')).toBeTruthy();
 *
 * // Rerender with new props while preserving Redux context
 * rerender(<MyScreen updated />);
 * expect(getByText('Updated')).toBeTruthy();
 *
 * // Access store for state inspection
 * expect(store.getState().settings.theme).toBe('light');
 * ```
 *
 * @param component - React element to render (typically a Redux-connected component)
 * @param options - Optional render configuration including custom store
 * @returns Render utilities with Redux-aware rerender function and store access
 *
 * @see {@link https://testing-library.com/docs/react-native-testing-library/api#rerender RTL rerender}
 * @see {@link mobile/src/test-utils/cameraRenderHelper.tsx Camera-specific helper with async readiness}
 * @see {@link docs/evidence/tasks/TASK-0916-clarifications.md Helper design rationale}
 */
export function renderWithRedux(
  component: ReactElement,
  options?: RenderWithReduxOptions
): RenderWithReduxResult {
  const mockStore = options?.store ?? createMockStore();

  // Render component wrapped in Redux Provider
  const renderResult = render(<Provider store={mockStore}>{component}</Provider>, options);

  return {
    ...renderResult,
    store: mockStore,
    // Override rerender to maintain Redux Provider context
    // Per TASK-0916: prevents "could not find react-redux context value" errors
    rerender: (newComponent: ReactElement) => {
      renderResult.rerender(<Provider store={mockStore}>{newComponent}</Provider>);
    },
  };
}

/**
 * Waits for device capability to be loaded in components using getDeviceCapability.
 *
 * Standards alignment:
 * - standards/testing-standards.md#react-component-testing: Use findBy* queries for async UI states
 * - standards/typescript.md#testability: Type-safe helper for deterministic async testing
 *
 * Usage:
 * ```typescript
 * renderWithRedux(<SettingsScreen />);
 * await waitForDeviceCapabilityReady();
 * expect(screen.getByText('Configure your app preferences')).toBeTruthy();
 * ```
 *
 * @param timeout - Maximum time to wait in milliseconds (default: 2000)
 * @returns Promise that resolves when the loading state disappears
 * @throws Error if loading text is still present after timeout
 */
export const waitForDeviceCapabilityReady = async (timeout = 2000): Promise<void> => {
  await waitFor(
    () => {
      // Assert that the loading text is no longer present
      expect(screen.queryByText('Loading device information...')).toBeNull();
    },
    { timeout }
  );
};

