import React, { useCallback, useMemo } from 'react';
import { View } from 'react-native';

type CameraDevice = {
  id: string;
  position: 'front' | 'back';
  name: string;
};

type PermissionState = {
  hasPermission: boolean;
  requestPermission: () => Promise<boolean>;
};

export const Camera = React.forwardRef<View>((props, ref) => (
  <View
    ref={ref}
    accessibilityLabel="vision-camera-stub"
    style={[{ backgroundColor: 'black' }, props.style]}
    {...props}
  />
));
Camera.displayName = 'VisionCameraStub';

export const useCameraDevice = (position: 'front' | 'back' = 'back'): CameraDevice => {
  return useMemo(
    () => ({ id: `stub-${position}`, position, name: `Stub ${position} camera` }),
    [position]
  );
};

export const useCameraPermission = (): PermissionState => {
  const requestPermission = useCallback(async () => true, []);
  return { hasPermission: true, requestPermission };
};

export const useFrameProcessor = () => useCallback(() => {}, []);
export const useSkiaFrameProcessor = () => useCallback(() => {}, []);
export const useCameraFormat = () => null;
export const useCameraRuntimeError = () => null;
export const useCameraDeviceError = () => null;
export const useCameraDevices = () => ({ devices: [] });

export type Frame = unknown;
export default Camera;
