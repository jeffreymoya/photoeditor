/**
 * CameraWithOverlay Component Tests
 *
 * Tests camera overlay toggling and component rendering per
 * standards/testing-standards.md coverage expectations (≥70% lines, ≥60% branches).
 *
 * Mocks:
 * - VisionCamera (useCameraDevice, useFrameProcessor, useSkiaFrameProcessor, Camera)
 * - Skia dependencies (no actual GPU rendering in tests)
 * - Reanimated (useSharedValue)
 * - Feature flags (deterministic device capability via __mocks__/featureFlags.ts)
 *
 * Per TASK-0917: Uses act-aware renderCameraWithRedux helper from test-utils to
 * eliminate React 19 act(...) warnings caused by async feature flag initialization.
 * Helper wraps render in act() and waits for component readiness per
 * standards/testing-standards.md#react-component-testing.
 *
 * Per TASK-0916: The renderCameraWithRedux helper includes Redux-aware rerender that
 * preserves Provider context across rerenders. For general Redux-connected components
 * (screens, settings) that don't require async feature flag waiting, use the general
 * renderWithRedux helper from @/__tests__/test-utils per
 * docs/evidence/tasks/TASK-0916-clarifications.md.
 */

import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react-native';
import React from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { useCameraDevice, useFrameProcessor, useSkiaFrameProcessor } from 'react-native-vision-camera';
import { Provider } from 'react-redux';

import { settingsSlice } from '../../../store/slices/settingsSlice';
import { renderCameraWithRedux } from '../../../test-utils';
import { CameraWithOverlay } from '../CameraWithOverlay';

import type { BoundingBox, FilterParams, OverlayConfig } from '../frameProcessors';

// Import mocked modules

// Mock VisionCamera
jest.mock('react-native-vision-camera', () => ({
  Camera: 'Camera',
  useCameraDevice: jest.fn(),
  useFrameProcessor: jest.fn((callback) => callback),
  useSkiaFrameProcessor: jest.fn((callback) => callback),
}));

// Mock Skia
jest.mock('@shopify/react-native-skia', () => ({
  Skia: {
    Paint: jest.fn(() => ({
      setStyle: jest.fn(),
      setStrokeWidth: jest.fn(),
      setColor: jest.fn(),
      setAntiAlias: jest.fn(),
      setAlphaf: jest.fn(),
      setColorFilter: jest.fn(),
    })),
    PaintStyle: {
      Stroke: 'Stroke',
    },
    Color: jest.fn((color) => color),
    XYWHRect: jest.fn((x, y, w, h) => ({ x, y, w, h })),
    Font: jest.fn(() => ({})),
    ColorFilter: {
      MakeMatrix: jest.fn((matrix) => ({ matrix })),
    },
  },
}));

// Mock Reanimated
jest.mock('react-native-reanimated', () => ({
  useSharedValue: jest.fn((initialValue) => ({
    value: initialValue,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    modify: jest.fn(),
  })),
}));

// Mock feature flags - using manual mock from __mocks__/featureFlags.ts
// This provides deterministic device capability helpers and synchronous Promise resolution
jest.mock('@/utils/featureFlags');

describe('CameraWithOverlay', () => {
  const mockDevice = { id: 'test-camera', position: 'back' };
  const mockUseCameraDevice = useCameraDevice as jest.MockedFunction<typeof useCameraDevice>;
  const mockUseFrameProcessor = useFrameProcessor as jest.MockedFunction<typeof useFrameProcessor>;
  const mockUseSkiaFrameProcessor = useSkiaFrameProcessor as jest.MockedFunction<typeof useSkiaFrameProcessor>;
  const mockUseSharedValue = useSharedValue as jest.MockedFunction<typeof useSharedValue>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCameraDevice.mockReturnValue(mockDevice as unknown as ReturnType<typeof useCameraDevice>);
    mockUseFrameProcessor.mockImplementation((callback) => callback as unknown as ReturnType<typeof useFrameProcessor>);
    mockUseSkiaFrameProcessor.mockImplementation((callback) => callback as unknown as ReturnType<typeof useSkiaFrameProcessor>);
    mockUseSharedValue.mockImplementation((initialValue) => ({
      value: initialValue,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      modify: jest.fn(),
    }));
  });

  describe('Rendering', () => {
    it('should display loading sentinel with correct accessibility attributes', () => {
      // Create mock store with settings reducer for sentinel test
      const mockStore = configureStore({
        reducer: {
          settings: settingsSlice.reducer,
        },
      });

      const { getByTestId, getByText } = render(
        <Provider store={mockStore}>
          <CameraWithOverlay />
        </Provider>
      );

      // Sentinel should be visible immediately before async feature flag resolution
      const sentinel = getByTestId('camera-loading-sentinel');
      expect(sentinel).toBeDefined();
      expect(sentinel.props.accessibilityRole).toBe('progressbar');
      expect(getByText('Loading camera settings...')).toBeDefined();
    });

    it('should show loading sentinel then render camera when device is available', async () => {
      const { UNSAFE_getByType, queryByTestId } = await renderCameraWithRedux(
        <CameraWithOverlay />
      );

      // Loading sentinel should have been visible initially (helper already waited for it to disappear)
      // After helper completes, sentinel should be gone
      expect(queryByTestId('camera-loading-sentinel')).toBeNull();

      // Camera should be rendered after feature flags initialize
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(UNSAFE_getByType('Camera' as any)).toBeDefined();
      expect(mockUseCameraDevice).toHaveBeenCalledWith('back');
    });

    it('should render camera when device is available', async () => {
      const { UNSAFE_getByType } = await renderCameraWithRedux(<CameraWithOverlay />);

      // Helper already waited for feature flag initialization
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(UNSAFE_getByType('Camera' as any)).toBeDefined();
      expect(mockUseCameraDevice).toHaveBeenCalledWith('back');
    });

    it('should render nothing when device is not available', async () => {
      mockUseCameraDevice.mockReturnValue(undefined);

      const { UNSAFE_queryByType } = await renderCameraWithRedux(<CameraWithOverlay />);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(UNSAFE_queryByType('Camera' as any)).toBeNull();
    });

    it('should use front camera when position is front', async () => {
      await renderCameraWithRedux(<CameraWithOverlay position="front" />);

      expect(mockUseCameraDevice).toHaveBeenCalledWith('front');
    });

    it('should use back camera when position is back', async () => {
      await renderCameraWithRedux(<CameraWithOverlay position="back" />);

      expect(mockUseCameraDevice).toHaveBeenCalledWith('back');
    });

    it('should apply custom style', async () => {
      const customStyle = { width: 300, height: 400 };
      const { UNSAFE_getByType } = await renderCameraWithRedux(<CameraWithOverlay style={customStyle} />);

      // Helper already waited for feature flag initialization
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const camera = UNSAFE_getByType('Camera' as any);
      expect(camera.props.style).toContainEqual(customStyle);
    });
  });

  describe('Overlay Toggling', () => {
    it('should initialize with empty overlays when no overlays enabled', async () => {
      await renderCameraWithRedux(<CameraWithOverlay enabledOverlays={[]} />);

      expect(mockUseSharedValue).toHaveBeenCalledWith({});
    });

    it('should enable bounding box overlay when specified', async () => {
      const boundingBoxes: BoundingBox[] = [
        { x: 100, y: 100, width: 200, height: 200, label: 'Face' },
      ];

      await renderCameraWithRedux(
        <CameraWithOverlay
          enabledOverlays={['boundingBoxes']}
          boundingBoxes={boundingBoxes}
        />
      );

      // Verify shared value was initialized
      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should enable live filter overlay when specified', async () => {
      const filterParams: FilterParams = {
        brightness: 0.2,
        contrast: 1.1,
        saturation: 1.0,
      };

      await renderCameraWithRedux(
        <CameraWithOverlay
          enabledOverlays={['liveFilters']}
          filterParams={filterParams}
        />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should enable AI overlay when specified', async () => {
      const overlayConfig: OverlayConfig = {
        opacity: 0.8,
        x: 50,
        y: 50,
      };

      await renderCameraWithRedux(
        <CameraWithOverlay
          enabledOverlays={['aiOverlay']}
          overlayConfig={overlayConfig}
        />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should enable multiple overlays simultaneously', async () => {
      const boundingBoxes: BoundingBox[] = [
        { x: 100, y: 100, width: 200, height: 200 },
      ];
      const filterParams: FilterParams = { brightness: 0.1 };

      await renderCameraWithRedux(
        <CameraWithOverlay
          enabledOverlays={['boundingBoxes', 'liveFilters']}
          boundingBoxes={boundingBoxes}
          filterParams={filterParams}
        />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
      expect(mockUseSkiaFrameProcessor).toHaveBeenCalled();
    });

    it('should not include filters when disabled', async () => {
      const filterParams: FilterParams = { brightness: 0.2 };

      await renderCameraWithRedux(
        <CameraWithOverlay
          enabledOverlays={[]} // Filters not enabled
          filterParams={filterParams}
        />
      );

      // Verify shared value initialized with empty options
      expect(mockUseSharedValue).toHaveBeenCalledWith({});
    });

    it('should not include bounding boxes when disabled', async () => {
      const boundingBoxes: BoundingBox[] = [
        { x: 100, y: 100, width: 200, height: 200 },
      ];

      await renderCameraWithRedux(
        <CameraWithOverlay
          enabledOverlays={[]} // Boxes not enabled
          boundingBoxes={boundingBoxes}
        />
      );

      expect(mockUseSharedValue).toHaveBeenCalledWith({});
    });

    it('should not include overlay when disabled', async () => {
      const overlayConfig: OverlayConfig = { opacity: 0.5 };

      await renderCameraWithRedux(
        <CameraWithOverlay
          enabledOverlays={[]} // Overlay not enabled
          overlayConfig={overlayConfig}
        />
      );

      expect(mockUseSharedValue).toHaveBeenCalledWith({});
    });
  });

  describe('Error Handling', () => {
    it('should call onError when camera error occurs', async () => {
      const mockOnError = jest.fn();
      const testError = new Error('Camera permission denied');

      const { UNSAFE_getByType } = await renderCameraWithRedux(
        <CameraWithOverlay onError={mockOnError} />
      );

      // Helper already waited for feature flag initialization
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const camera = UNSAFE_getByType('Camera' as any);
      camera.props.onError(testError);

      expect(mockOnError).toHaveBeenCalledWith(testError);
    });

    it('should log error to console when onError not provided', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const testError = new Error('Camera initialization failed');

      const { UNSAFE_getByType } = await renderCameraWithRedux(<CameraWithOverlay />);

      // Helper already waited for feature flag initialization
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const camera = UNSAFE_getByType('Camera' as any);
      camera.props.onError(testError);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[CameraWithOverlay] Camera error:',
        testError
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Frame Processor', () => {
    it('should register frame processor', async () => {
      await renderCameraWithRedux(<CameraWithOverlay enabledOverlays={['boundingBoxes']} />);

      expect(mockUseSkiaFrameProcessor).toHaveBeenCalled();
    });

    it('should update frame processor when overlays change', async () => {
      const { rerender } = await renderCameraWithRedux(
        <CameraWithOverlay enabledOverlays={['boundingBoxes']} />
      );

      // Helper already waited for initial feature flag initialization
      const initialCallCount = mockUseSkiaFrameProcessor.mock.calls.length;

      // Rerender with new overlays (Redux-aware rerender preserves Provider context)
      rerender(
        <CameraWithOverlay enabledOverlays={['boundingBoxes', 'liveFilters']} />
      );

      // Frame processor should be re-registered
      expect(mockUseSkiaFrameProcessor.mock.calls.length).toBeGreaterThan(
        initialCallCount
      );
    });
  });

  describe('Prop Defaults', () => {
    it('should use default position (back)', async () => {
      await renderCameraWithRedux(<CameraWithOverlay />);

      expect(mockUseCameraDevice).toHaveBeenCalledWith('back');
    });

    it('should use default empty overlays', async () => {
      await renderCameraWithRedux(<CameraWithOverlay />);

      expect(mockUseSharedValue).toHaveBeenCalledWith({});
    });

    it('should use default empty bounding boxes', async () => {
      await renderCameraWithRedux(<CameraWithOverlay enabledOverlays={['boundingBoxes']} />);

      // Should not crash with empty boxes array
      expect(mockUseSharedValue).toHaveBeenCalled();
    });
  });

  describe('Bounding Box Variations', () => {
    it('should handle bounding box with label', async () => {
      const boxes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, label: 'Object' },
      ];

      await renderCameraWithRedux(
        <CameraWithOverlay enabledOverlays={['boundingBoxes']} boundingBoxes={boxes} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should handle bounding box with label and confidence', async () => {
      const boxes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, label: 'Face', confidence: 0.95 },
      ];

      await renderCameraWithRedux(
        <CameraWithOverlay enabledOverlays={['boundingBoxes']} boundingBoxes={boxes} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should handle multiple bounding boxes', async () => {
      const boxes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, label: 'Object 1' },
        { x: 150, y: 150, width: 80, height: 80, label: 'Object 2' },
        { x: 300, y: 300, width: 120, height: 120, label: 'Object 3' },
      ];

      await renderCameraWithRedux(
        <CameraWithOverlay enabledOverlays={['boundingBoxes']} boundingBoxes={boxes} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });
  });

  describe('Filter Parameter Variations', () => {
    it('should handle brightness only', async () => {
      const filters: FilterParams = { brightness: 0.3 };

      await renderCameraWithRedux(
        <CameraWithOverlay enabledOverlays={['liveFilters']} filterParams={filters} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should handle contrast only', async () => {
      const filters: FilterParams = { contrast: 1.5 };

      await renderCameraWithRedux(
        <CameraWithOverlay enabledOverlays={['liveFilters']} filterParams={filters} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should handle saturation only', async () => {
      const filters: FilterParams = { saturation: 0.8 };

      await renderCameraWithRedux(
        <CameraWithOverlay enabledOverlays={['liveFilters']} filterParams={filters} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should handle all filter parameters', async () => {
      const filters: FilterParams = {
        brightness: 0.1,
        contrast: 1.2,
        saturation: 1.1,
      };

      await renderCameraWithRedux(
        <CameraWithOverlay enabledOverlays={['liveFilters']} filterParams={filters} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });
  });

  describe('Overlay Config Variations', () => {
    it('should handle overlay with opacity only', async () => {
      const config: OverlayConfig = { opacity: 0.6 };

      await renderCameraWithRedux(
        <CameraWithOverlay enabledOverlays={['aiOverlay']} overlayConfig={config} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should handle overlay with position', async () => {
      const config: OverlayConfig = { x: 100, y: 200 };

      await renderCameraWithRedux(
        <CameraWithOverlay enabledOverlays={['aiOverlay']} overlayConfig={config} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should handle overlay with all parameters', async () => {
      const config: OverlayConfig = {
        opacity: 0.75,
        x: 50,
        y: 100,
      };

      await renderCameraWithRedux(
        <CameraWithOverlay enabledOverlays={['aiOverlay']} overlayConfig={config} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });
  });
});
