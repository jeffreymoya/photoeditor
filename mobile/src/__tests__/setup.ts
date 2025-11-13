import 'react-native-gesture-handler/jestSetup';

// Set React's global IS_REACT_ACT_ENVIRONMENT flag for React 19 compatibility
// This tells React that all state updates during tests happen within act() boundaries,
// eliminating "not wrapped in act(...)" warnings for async effects in components.
// Per React 19 migration guide and TASK-0917.
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Mock Reanimated
jest.mock('react-native-reanimated', () => {
  const reanimatedModule = require('react-native-reanimated/mock');

  if (
    typeof reanimatedModule === 'object' &&
    reanimatedModule !== null &&
    'default' in reanimatedModule &&
    typeof reanimatedModule.default === 'object' &&
    reanimatedModule.default !== null
  ) {
    const defaultExport = reanimatedModule.default as { call?: (...args: unknown[]) => unknown };
    defaultExport.call = () => {};
  }

  return reanimatedModule;
});

// Mock Expo modules
jest.mock('expo-camera', () => ({
  Camera: {
    Constants: {},
    requestCameraPermissionsAsync: () => Promise.resolve({ status: 'granted' }),
  },
  CameraType: {
    back: 'back',
    front: 'front',
  },
}));

// Mock expo-camera/legacy submodule (required for CameraScreen imports)
jest.mock('expo-camera/legacy', () => ({
  Camera: {
    Constants: {},
    requestCameraPermissionsAsync: () => Promise.resolve({ status: 'granted' }),
  },
  CameraType: {
    back: 'back',
    front: 'front',
  },
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: () => Promise.resolve({ canceled: true }),
  requestMediaLibraryPermissionsAsync: () => Promise.resolve({ status: 'granted' }),
  MediaTypeOptions: {
    Images: 'Images',
  },
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock native modules
jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter');
