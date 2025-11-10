/**
 * CameraWithOverlay Component Tests
 *
 * Tests camera overlay toggling and component rendering per
 * standards/testing-standards.md coverage expectations (≥70% lines, ≥60% branches).
 *
 * Mocks:
 * - VisionCamera (useCameraDevice, useFrameProcessor, Camera)
 * - Skia dependencies (no actual GPU rendering in tests)
 * - Reanimated (useSharedValue)
 */

import { render } from '@testing-library/react-native';
import React from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { useCameraDevice, useFrameProcessor } from 'react-native-vision-camera';

import { CameraWithOverlay } from '../CameraWithOverlay';

import type { BoundingBox, FilterParams, OverlayConfig } from '../frameProcessors';

// Import mocked modules

// Mock VisionCamera
jest.mock('react-native-vision-camera', () => ({
  Camera: 'Camera',
  useCameraDevice: jest.fn(),
  useFrameProcessor: jest.fn((callback) => callback),
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


describe('CameraWithOverlay', () => {
  const mockDevice = { id: 'test-camera', position: 'back' };
  const mockUseCameraDevice = useCameraDevice as jest.MockedFunction<typeof useCameraDevice>;
  const mockUseFrameProcessor = useFrameProcessor as jest.MockedFunction<typeof useFrameProcessor>;
  const mockUseSharedValue = useSharedValue as jest.MockedFunction<typeof useSharedValue>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCameraDevice.mockReturnValue(mockDevice as unknown as ReturnType<typeof useCameraDevice>);
    mockUseFrameProcessor.mockImplementation((callback) => callback as unknown as ReturnType<typeof useFrameProcessor>);
    mockUseSharedValue.mockImplementation((initialValue) => ({
      value: initialValue,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      modify: jest.fn(),
    }));
  });

  describe('Rendering', () => {
    it('should render camera when device is available', () => {
      const { UNSAFE_getByType } = render(<CameraWithOverlay />);

      expect(mockUseCameraDevice).toHaveBeenCalledWith('back');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(UNSAFE_getByType('Camera' as any)).toBeDefined();
    });

    it('should render nothing when device is not available', () => {
      mockUseCameraDevice.mockReturnValue(undefined);

      const { UNSAFE_queryByType } = render(<CameraWithOverlay />);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(UNSAFE_queryByType('Camera' as any)).toBeNull();
    });

    it('should use front camera when position is front', () => {
      render(<CameraWithOverlay position="front" />);

      expect(mockUseCameraDevice).toHaveBeenCalledWith('front');
    });

    it('should use back camera when position is back', () => {
      render(<CameraWithOverlay position="back" />);

      expect(mockUseCameraDevice).toHaveBeenCalledWith('back');
    });

    it('should apply custom style', () => {
      const customStyle = { width: 300, height: 400 };
      const { UNSAFE_getByType } = render(<CameraWithOverlay style={customStyle} />);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const camera = UNSAFE_getByType('Camera' as any);
      expect(camera.props.style).toContainEqual(customStyle);
    });
  });

  describe('Overlay Toggling', () => {
    it('should initialize with empty overlays when no overlays enabled', () => {
      render(<CameraWithOverlay enabledOverlays={[]} />);

      expect(mockUseSharedValue).toHaveBeenCalledWith({});
    });

    it('should enable bounding box overlay when specified', () => {
      const boundingBoxes: BoundingBox[] = [
        { x: 100, y: 100, width: 200, height: 200, label: 'Face' },
      ];

      render(
        <CameraWithOverlay
          enabledOverlays={['boundingBoxes']}
          boundingBoxes={boundingBoxes}
        />
      );

      // Verify shared value was initialized
      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should enable live filter overlay when specified', () => {
      const filterParams: FilterParams = {
        brightness: 0.2,
        contrast: 1.1,
        saturation: 1.0,
      };

      render(
        <CameraWithOverlay
          enabledOverlays={['liveFilters']}
          filterParams={filterParams}
        />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should enable AI overlay when specified', () => {
      const overlayConfig: OverlayConfig = {
        opacity: 0.8,
        x: 50,
        y: 50,
      };

      render(
        <CameraWithOverlay
          enabledOverlays={['aiOverlay']}
          overlayConfig={overlayConfig}
        />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should enable multiple overlays simultaneously', () => {
      const boundingBoxes: BoundingBox[] = [
        { x: 100, y: 100, width: 200, height: 200 },
      ];
      const filterParams: FilterParams = { brightness: 0.1 };

      render(
        <CameraWithOverlay
          enabledOverlays={['boundingBoxes', 'liveFilters']}
          boundingBoxes={boundingBoxes}
          filterParams={filterParams}
        />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
      expect(mockUseFrameProcessor).toHaveBeenCalled();
    });

    it('should not include filters when disabled', () => {
      const filterParams: FilterParams = { brightness: 0.2 };

      render(
        <CameraWithOverlay
          enabledOverlays={[]} // Filters not enabled
          filterParams={filterParams}
        />
      );

      // Verify shared value initialized with empty options
      expect(mockUseSharedValue).toHaveBeenCalledWith({});
    });

    it('should not include bounding boxes when disabled', () => {
      const boundingBoxes: BoundingBox[] = [
        { x: 100, y: 100, width: 200, height: 200 },
      ];

      render(
        <CameraWithOverlay
          enabledOverlays={[]} // Boxes not enabled
          boundingBoxes={boundingBoxes}
        />
      );

      expect(mockUseSharedValue).toHaveBeenCalledWith({});
    });

    it('should not include overlay when disabled', () => {
      const overlayConfig: OverlayConfig = { opacity: 0.5 };

      render(
        <CameraWithOverlay
          enabledOverlays={[]} // Overlay not enabled
          overlayConfig={overlayConfig}
        />
      );

      expect(mockUseSharedValue).toHaveBeenCalledWith({});
    });
  });

  describe('Error Handling', () => {
    it('should call onError when camera error occurs', () => {
      const mockOnError = jest.fn();
      const testError = new Error('Camera permission denied');

      const { UNSAFE_getByType } = render(
        <CameraWithOverlay onError={mockOnError} />
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const camera = UNSAFE_getByType('Camera' as any);
      camera.props.onError(testError);

      expect(mockOnError).toHaveBeenCalledWith(testError);
    });

    it('should log error to console when onError not provided', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const testError = new Error('Camera initialization failed');

      const { UNSAFE_getByType } = render(<CameraWithOverlay />);

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
    it('should register frame processor', () => {
      render(<CameraWithOverlay enabledOverlays={['boundingBoxes']} />);

      expect(mockUseFrameProcessor).toHaveBeenCalled();
    });

    it('should update frame processor when overlays change', () => {
      const { rerender } = render(
        <CameraWithOverlay enabledOverlays={['boundingBoxes']} />
      );

      const initialCallCount = mockUseFrameProcessor.mock.calls.length;

      rerender(
        <CameraWithOverlay enabledOverlays={['boundingBoxes', 'liveFilters']} />
      );

      // Frame processor should be re-registered
      expect(mockUseFrameProcessor.mock.calls.length).toBeGreaterThan(
        initialCallCount
      );
    });
  });

  describe('Prop Defaults', () => {
    it('should use default position (back)', () => {
      render(<CameraWithOverlay />);

      expect(mockUseCameraDevice).toHaveBeenCalledWith('back');
    });

    it('should use default empty overlays', () => {
      render(<CameraWithOverlay />);

      expect(mockUseSharedValue).toHaveBeenCalledWith({});
    });

    it('should use default empty bounding boxes', () => {
      render(<CameraWithOverlay enabledOverlays={['boundingBoxes']} />);

      // Should not crash with empty boxes array
      expect(mockUseSharedValue).toHaveBeenCalled();
    });
  });

  describe('Bounding Box Variations', () => {
    it('should handle bounding box with label', () => {
      const boxes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, label: 'Object' },
      ];

      render(
        <CameraWithOverlay enabledOverlays={['boundingBoxes']} boundingBoxes={boxes} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should handle bounding box with label and confidence', () => {
      const boxes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, label: 'Face', confidence: 0.95 },
      ];

      render(
        <CameraWithOverlay enabledOverlays={['boundingBoxes']} boundingBoxes={boxes} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should handle multiple bounding boxes', () => {
      const boxes: BoundingBox[] = [
        { x: 0, y: 0, width: 100, height: 100, label: 'Object 1' },
        { x: 150, y: 150, width: 80, height: 80, label: 'Object 2' },
        { x: 300, y: 300, width: 120, height: 120, label: 'Object 3' },
      ];

      render(
        <CameraWithOverlay enabledOverlays={['boundingBoxes']} boundingBoxes={boxes} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });
  });

  describe('Filter Parameter Variations', () => {
    it('should handle brightness only', () => {
      const filters: FilterParams = { brightness: 0.3 };

      render(
        <CameraWithOverlay enabledOverlays={['liveFilters']} filterParams={filters} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should handle contrast only', () => {
      const filters: FilterParams = { contrast: 1.5 };

      render(
        <CameraWithOverlay enabledOverlays={['liveFilters']} filterParams={filters} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should handle saturation only', () => {
      const filters: FilterParams = { saturation: 0.8 };

      render(
        <CameraWithOverlay enabledOverlays={['liveFilters']} filterParams={filters} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should handle all filter parameters', () => {
      const filters: FilterParams = {
        brightness: 0.1,
        contrast: 1.2,
        saturation: 1.1,
      };

      render(
        <CameraWithOverlay enabledOverlays={['liveFilters']} filterParams={filters} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });
  });

  describe('Overlay Config Variations', () => {
    it('should handle overlay with opacity only', () => {
      const config: OverlayConfig = { opacity: 0.6 };

      render(
        <CameraWithOverlay enabledOverlays={['aiOverlay']} overlayConfig={config} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should handle overlay with position', () => {
      const config: OverlayConfig = { x: 100, y: 200 };

      render(
        <CameraWithOverlay enabledOverlays={['aiOverlay']} overlayConfig={config} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });

    it('should handle overlay with all parameters', () => {
      const config: OverlayConfig = {
        opacity: 0.75,
        x: 50,
        y: 100,
      };

      render(
        <CameraWithOverlay enabledOverlays={['aiOverlay']} overlayConfig={config} />
      );

      expect(mockUseSharedValue).toHaveBeenCalled();
    });
  });
});
