/**
 * Notification Service Adapter Tests - Batch 1: Initialization and Permissions
 *
 * Per standards/testing-standards.md:
 * - Services/Adapters: ≥80% line coverage, ≥70% branch coverage
 * - Mock external dependencies using locally defined stubs
 * - Reset mocks between test cases to avoid state leakage
 *
 * Per task TASK-0828 plan step 1:
 * - Basic initialization tests
 * - requestPermissions (granted, denied, undetermined)
 * - scheduleLocalNotification (success, error)
 * - Mock Expo Notifications module and fetch API
 *
 * Per standards/frontend-tier.md Services & Integration Layer:
 * - Adapters implement ports for platform API encapsulation
 * - Expo Notifications with a thin adapter
 */

import { DeviceTokenResponseSchema } from '@photoeditor/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import {
  createMockResponse,
  buildDeviceTokenResponse,
  schemaSafeResponse,
} from '../../__tests__/stubs';
import { NotificationServiceAdapter } from '../adapter';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage');

// Mock Expo Device with mutable properties
const mockDevice = {
  isDevice: true,
  deviceName: 'Test Device' as string | null,
};
jest.mock('expo-device', () => ({
  get isDevice() {
    return mockDevice.isDevice;
  },
  get deviceName() {
    return mockDevice.deviceName;
  },
}));

// Mock Expo Notifications
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  AndroidImportance: {
    MAX: 5,
  },
}));

// Mock Platform
jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
  },
}));

// Mock global fetch
global.fetch = jest.fn();

describe('NotificationServiceAdapter - Initialization and Permissions', () => {
  let adapter: NotificationServiceAdapter;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset Platform.OS to iOS by default
    (Platform as { OS: string }).OS = 'ios';

    // Reset Device mocks to default values
    mockDevice.isDevice = true;
    mockDevice.deviceName = 'Test Device';

    // Default mock for AsyncStorage
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

    adapter = new NotificationServiceAdapter();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with default base URL', () => {
      const newAdapter = new NotificationServiceAdapter();
      expect(newAdapter).toBeInstanceOf(NotificationServiceAdapter);
    });

    it('should initialize with environment base URL when set', () => {
      const originalEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
      process.env.EXPO_PUBLIC_API_BASE_URL = 'https://api.custom.dev';

      const newAdapter = new NotificationServiceAdapter();

      expect(newAdapter).toBeInstanceOf(NotificationServiceAdapter);

      // Restore original env
      if (originalEnv) {
        process.env.EXPO_PUBLIC_API_BASE_URL = originalEnv;
      } else {
        delete process.env.EXPO_PUBLIC_API_BASE_URL;
      }
    });
  });

  describe('initialize - Permission Granted', () => {
    it('should successfully initialize with granted permissions', async () => {
      const mockToken = 'ExponentPushToken[test-token-123]';

      // Mock permissions already granted
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      // Mock token retrieval
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: mockToken,
      });

      // Mock stored device ID
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-test-123');

      // Mock backend registration
      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
        })
      );

      await adapter.initialize();

      expect(Notifications.getPermissionsAsync).toHaveBeenCalled();
      expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalled();
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('expo_push_token', mockToken);
      expect(adapter.getExpoPushToken()).toBe(mockToken);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/device-token'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('initialize - Permission Request Flow', () => {
    it('should request permissions when not granted', async () => {
      const mockToken = 'ExponentPushToken[test-token-456]';

      // Mock permissions not granted initially
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'undetermined',
      });

      // Mock permission request granted
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      // Mock token retrieval
      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: mockToken,
      });

      // Mock stored device ID
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-test-456');

      // Mock backend registration
      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
        })
      );

      await adapter.initialize();

      expect(Notifications.getPermissionsAsync).toHaveBeenCalled();
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
      expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalled();
      expect(adapter.getExpoPushToken()).toBe(mockToken);
    });

    it('should handle denied permissions gracefully', async () => {
      // Mock permissions denied
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      // Mock permission request also denied
      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      await adapter.initialize();

      expect(Notifications.getPermissionsAsync).toHaveBeenCalled();
      expect(Notifications.requestPermissionsAsync).toHaveBeenCalled();
      expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
      expect(adapter.getExpoPushToken()).toBeUndefined();
    });
  });

  describe('scheduleLocalNotification', () => {
    it('should schedule local notification with title and body', async () => {
      (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notification-id-1');

      await adapter.scheduleLocalNotification('Test Title', 'Test Body');

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
        content: {
          title: 'Test Title',
          body: 'Test Body',
        },
        trigger: null,
      });
    });

    it('should schedule local notification with data payload', async () => {
      (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notification-id-2');

      const data = { jobId: 'job-123', type: 'job_completion' };
      await adapter.scheduleLocalNotification('Test Title', 'Test Body', data);

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
        content: {
          title: 'Test Title',
          body: 'Test Body',
          data,
        },
        trigger: null,
      });
    });

    it('should handle scheduling errors gracefully', async () => {
      (Notifications.scheduleNotificationAsync as jest.Mock).mockRejectedValue(
        new Error('Notification scheduling failed')
      );

      await expect(
        adapter.scheduleLocalNotification('Test Title', 'Test Body')
      ).rejects.toThrow('Notification scheduling failed');
    });
  });

  describe('cancelAllNotifications', () => {
    it('should cancel all scheduled notifications', async () => {
      (Notifications.cancelAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(undefined);

      await adapter.cancelAllNotifications();

      expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    });
  });
});

describe('NotificationServiceAdapter - Backend Registration', () => {
  let adapter: NotificationServiceAdapter;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset Platform.OS to iOS by default
    (Platform as { OS: string }).OS = 'ios';

    // Reset Device mocks to default values
    mockDevice.isDevice = true;
    mockDevice.deviceName = 'Test Device';

    // Default mock for AsyncStorage
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

    adapter = new NotificationServiceAdapter();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Device Token Registration', () => {
    it('should register device token with backend on iOS', async () => {
      const mockToken = 'ExponentPushToken[ios-token-123]';

      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: mockToken,
      });

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-ios-123');

      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
        })
      );

      await adapter.initialize();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/device-token'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('ios'),
        })
      );
    });

    it('should register device token with backend on Android', async () => {
      (Platform as { OS: string }).OS = 'android';

      const mockToken = 'ExponentPushToken[android-token-456]';

      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: mockToken,
      });

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-android-456');

      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
        })
      );

      // Mock Android notification channel setup
      (Notifications.setNotificationChannelAsync as jest.Mock).mockResolvedValue(undefined);

      await adapter.initialize();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/device-token'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('android'),
        })
      );

      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        'default',
        expect.objectContaining({
          name: 'default',
          importance: 5,
        })
      );
    });

    it('should handle backend registration HTTP 4xx errors', async () => {
      const mockToken = 'ExponentPushToken[test-token-789]';

      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: mockToken,
      });

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-test-789');

      mockFetch.mockResolvedValue(
        createMockResponse({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
        })
      );

      // Should not throw, just log warning
      await adapter.initialize();

      expect(adapter.getExpoPushToken()).toBe(mockToken);
    });

    it('should handle backend registration HTTP 5xx errors', async () => {
      const mockToken = 'ExponentPushToken[test-token-999]';

      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: mockToken,
      });

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-test-999');

      mockFetch.mockResolvedValue(
        createMockResponse({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
      );

      // Should not throw, just log warning
      await adapter.initialize();

      expect(adapter.getExpoPushToken()).toBe(mockToken);
    });

    it('should handle network failures during registration', async () => {
      const mockToken = 'ExponentPushToken[test-token-network]';

      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: mockToken,
      });

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-test-network');

      mockFetch.mockRejectedValue(new Error('Network timeout'));

      // Should not throw, just log error
      await adapter.initialize();

      expect(adapter.getExpoPushToken()).toBe(mockToken);
    });

    it('should generate device ID when not stored', async () => {
      const mockToken = 'ExponentPushToken[test-token-new-device]';

      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: mockToken,
      });

      // No stored device ID
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
        })
      );

      await adapter.initialize();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'device_id',
        expect.stringMatching(/^Test Device-ios-\d+$/)
      );
    });
  });

  describe('unregisterFromBackend', () => {
    it('should unregister device token from backend', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-unregister-123');

      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
          overrides: { message: 'Device token deactivated successfully' },
        })
      );

      await adapter.unregisterFromBackend();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/device-token\?deviceId=device-unregister-123$/),
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle unregister HTTP errors gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-unregister-456');

      mockFetch.mockResolvedValue(
        createMockResponse({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        })
      );

      // Should not throw, just log warning
      await adapter.unregisterFromBackend();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/device-token\?deviceId=device-unregister-456$/),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should handle unregister network failures gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-unregister-network');

      mockFetch.mockRejectedValue(new Error('Network error'));

      // Should not throw, just log error
      await adapter.unregisterFromBackend();

      expect(mockFetch).toHaveBeenCalled();
    });
  });
});

describe('NotificationServiceAdapter - Edge Cases and Platform Behavior', () => {
  let adapter: NotificationServiceAdapter;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset Platform.OS to iOS by default
    (Platform as { OS: string }).OS = 'ios';

    // Reset Device mocks to default values
    mockDevice.isDevice = true;
    mockDevice.deviceName = 'Test Device';

    // Default mock for AsyncStorage
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

    adapter = new NotificationServiceAdapter();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('scheduleJobCompletionNotification', () => {
    it('should schedule job completion notification with push token', async () => {
      const mockToken = 'ExponentPushToken[test-job-token]';

      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: mockToken,
      });

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-job-123');

      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
        })
      );

      (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notification-id-job');

      await adapter.initialize();

      await adapter.scheduleJobCompletionNotification('job-123', 'Make it blue');

      expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
        content: {
          title: 'Photo Processing Complete!',
          body: expect.stringContaining('Make it blue'),
          data: {
            type: 'job_completed',
            jobId: 'job-123',
            prompt: 'Make it blue',
          },
        },
        trigger: null,
      });
    });

    it('should skip job completion notification when no push token available', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
      });

      await adapter.initialize();

      await adapter.scheduleJobCompletionNotification('job-456', 'Make it red');

      expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    });
  });

  describe('Token Retrieval Error Handling', () => {
    it('should handle token retrieval failure gracefully', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      (Notifications.getExpoPushTokenAsync as jest.Mock).mockRejectedValue(
        new Error('Failed to get push token')
      );

      // Should not throw
      await adapter.initialize();

      expect(adapter.getExpoPushToken()).toBeUndefined();
    });
  });

  describe('Platform-Specific Behavior', () => {
    it('should set up Android notification channel on Android platform', async () => {
      (Platform as { OS: string }).OS = 'android';

      const mockToken = 'ExponentPushToken[android-channel-token]';

      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: mockToken,
      });

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-android-channel');

      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
        })
      );

      (Notifications.setNotificationChannelAsync as jest.Mock).mockResolvedValue(undefined);

      await adapter.initialize();

      expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
        'default',
        expect.objectContaining({
          name: 'default',
          importance: 5,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        })
      );
    });

    it('should not set up notification channel on iOS platform', async () => {
      (Platform as { OS: string }).OS = 'ios';

      const mockToken = 'ExponentPushToken[ios-no-channel-token]';

      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: mockToken,
      });

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-ios-no-channel');

      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
        })
      );

      await adapter.initialize();

      expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
    });

    it('should generate simulator device ID when not on real device', async () => {
      // Mock simulator environment BEFORE creating adapter
      mockDevice.isDevice = false;
      mockDevice.deviceName = null;

      // Create new adapter instance with simulator mocks
      const simulatorAdapter = new NotificationServiceAdapter();

      const mockToken = 'ExponentPushToken[simulator-token]';

      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: mockToken,
      });

      // No stored device ID
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
        })
      );

      await simulatorAdapter.initialize();

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        'device_id',
        expect.stringMatching(/^simulator-ios-\d+$/)
      );
    });
  });

  describe('Notification Listeners', () => {
    it('should set up notification listeners on initialization', async () => {
      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: 'ExponentPushToken[listener-token]',
      });

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-listener-123');

      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
        })
      );

      await adapter.initialize();

      expect(Notifications.addNotificationReceivedListener).toHaveBeenCalled();
      expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalled();
    });
  });

  describe('Backend Registration Response Validation', () => {
    it('should parse successful backend response', async () => {
      const mockToken = 'ExponentPushToken[valid-response-token]';

      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: mockToken,
      });

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-valid-response');

      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
          overrides: {
            success: true,
            message: 'Device token registered successfully',
          },
        })
      );

      await adapter.initialize();

      expect(adapter.getExpoPushToken()).toBe(mockToken);
    });

    it('should handle backend response with success=false', async () => {
      const mockToken = 'ExponentPushToken[failed-response-token]';

      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: mockToken,
      });

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-failed-response');

      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
          overrides: {
            success: false,
            message: 'Invalid device token format',
          },
        })
      );

      // Should not throw, just log warning
      await adapter.initialize();

      expect(adapter.getExpoPushToken()).toBe(mockToken);
    });

    it('should handle malformed backend response', async () => {
      const mockToken = 'ExponentPushToken[malformed-response-token]';

      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: mockToken,
      });

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-malformed-response');

      // Invalid response that will fail Zod parsing
      mockFetch.mockResolvedValue(
        createMockResponse({
          data: { invalid: 'schema' },
        })
      );

      // Should not throw, just log error
      await adapter.initialize();

      expect(adapter.getExpoPushToken()).toBe(mockToken);
    });
  });

  describe('getExpoPushToken', () => {
    it('should return undefined when not initialized', () => {
      const newAdapter = new NotificationServiceAdapter();
      expect(newAdapter.getExpoPushToken()).toBeUndefined();
    });

    it('should return token after successful initialization', async () => {
      const mockToken = 'ExponentPushToken[get-token-test]';

      (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'granted',
      });

      (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({
        data: mockToken,
      });

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('device-get-token');

      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
        })
      );

      await adapter.initialize();

      expect(adapter.getExpoPushToken()).toBe(mockToken);
    });
  });
});
