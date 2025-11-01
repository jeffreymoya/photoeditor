/**
 * Notification Service Adapter
 *
 * Concrete implementation of INotificationService per the Frontend Tier standard:
 * - Implements port interface for notification operations
 * - Encapsulates platform APIs (Expo Notifications, AsyncStorage, Device)
 * - Thin adapter over Expo Notifications with retry for backend registration
 *
 * Per the TypeScript Standards:
 * - Named exports (no defaults in domain code)
 * - Strong typing (no any)
 */

import { DeviceTokenRegistrationSchema, DeviceTokenResponseSchema } from '@photoeditor/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { logger } from '../../utils/logger';

import type { INotificationService } from './port';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Notification Service Adapter - concrete implementation of INotificationService
 *
 * Encapsulates Expo Notifications, AsyncStorage, and Device APIs behind port interface.
 * Feature layer depends only on INotificationService, not this concrete adapter.
 */
export class NotificationServiceAdapter implements INotificationService {
  private expoPushToken: string | undefined = undefined;
  private baseUrl: string;

  constructor() {
    // Use the same base URL logic as UploadServiceAdapter
    this.baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.photoeditor.dev';
  }

  async initialize(): Promise<void> {
    await this.registerForPushNotificationsAsync();
    this.setupNotificationListeners();

    // Register with backend if we have a token
    if (this.expoPushToken) {
      await this.registerWithBackend();
    }
  }

  private async registerForPushNotificationsAsync(): Promise<void> {
    let token;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      logger.warn('Failed to get push token for push notification!');
      return;
    }

    try {
      token = (await Notifications.getExpoPushTokenAsync()).data;
      this.expoPushToken = token;
      await AsyncStorage.setItem('expo_push_token', token);
      logger.info('Expo push token:', token);

      // Register with backend
      await this.registerWithBackend();
    } catch (error) {
      logger.error('Error getting push token:', error);
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }
  }

  private setupNotificationListeners(): void {
    // Handle notifications when app is in foreground
    Notifications.addNotificationReceivedListener((notification) => {
      logger.info('Notification received:', notification);

      // Handle different types of job notifications
      const data = notification.request.content.data;
      this.handleJobNotification(data);
    });

    // Handle notification interactions
    Notifications.addNotificationResponseReceivedListener((response) => {
      logger.info('Notification response:', response);

      // Handle job completion notifications
      const data = response.notification.request.content.data;
      this.handleJobNotification(data, true);
    });
  }

  private handleJobNotification(data: Record<string, unknown>, isUserInteraction: boolean = false): void {
    if (data.type === 'job_status_update' || data.type === 'job_completion') {
      // Update job status in Redux store
      // This would need to be connected to your Redux store
      logger.info('Job status update:', {
        jobId: data.jobId,
        status: data.status,
        isUserInteraction,
      });

      // You can dispatch Redux actions here to update job status
      // store.dispatch(updateJob({ id: data.jobId, status: data.status }));
    }

    if (data.type === 'batch_completion') {
      logger.info('Batch job completed:', {
        batchJobId: data.batchJobId,
        totalCount: data.totalCount,
        isUserInteraction,
      });

      // Handle batch completion
      // store.dispatch(updateBatchJob({ id: data.batchJobId, status: 'COMPLETED' }));
    }

    if (isUserInteraction) {
      // Navigate to appropriate screen based on notification type
      switch (data.action) {
        case 'download':
          // Navigate to download screen
          break;
        case 'view_batch':
          // Navigate to batch results screen
          break;
        case 'retry':
          // Navigate to retry screen or show retry dialog
          break;
      }
    }
  }

  async scheduleJobCompletionNotification(jobId: string, prompt: string): Promise<void> {
    if (!this.expoPushToken) {
      logger.warn('No push token available');
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Photo Processing Complete!',
        body: `Your edited photo for "${prompt}" is ready`,
        data: {
          type: 'job_completed',
          jobId,
          prompt
        },
      },
      trigger: null, // Send immediately
    });
  }

  async scheduleLocalNotification(
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<void> {
    const content: { title: string; body: string; data?: Record<string, unknown> } = {
      title,
      body,
    };
    if (data !== undefined) {
      content.data = data;
    }

    await Notifications.scheduleNotificationAsync({
      content,
      trigger: null,
    });
  }

  async cancelAllNotifications(): Promise<void> {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  private async registerWithBackend(): Promise<void> {
    if (!this.expoPushToken) {
      logger.warn('No push token available for backend registration');
      return;
    }

    try {
      const deviceId = await this.getDeviceId();
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';

      const requestBody = DeviceTokenRegistrationSchema.parse({
        expoPushToken: this.expoPushToken,
        platform,
        deviceId,
      });

      const response = await fetch(`${this.baseUrl}/device-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        logger.warn('Failed to register device token with backend:', response.statusText);
        return;
      }

      const data = await response.json();
      const result = DeviceTokenResponseSchema.parse(data);

      if (result.success) {
        logger.info('Successfully registered device token with backend');
      } else {
        logger.warn('Failed to register device token with backend:', result.message);
      }
    } catch (error) {
      logger.error('Error registering device token with backend:', error);
    }
  }

  private async getDeviceId(): Promise<string> {
    // Try to get a stored device ID first
    let deviceId = await AsyncStorage.getItem('device_id');

    if (!deviceId) {
      // Generate a device ID based on device info
      if (Device.isDevice && Device.deviceName) {
        deviceId = `${Device.deviceName}-${Platform.OS}-${Date.now()}`;
      } else {
        deviceId = `simulator-${Platform.OS}-${Date.now()}`;
      }

      // Store for future use
      await AsyncStorage.setItem('device_id', deviceId);
    }

    return deviceId;
  }

  async unregisterFromBackend(): Promise<void> {
    try {
      const deviceId = await this.getDeviceId();

      const response = await fetch(
        `${this.baseUrl}/device-token?deviceId=${encodeURIComponent(deviceId)}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        logger.warn('Failed to unregister device token from backend:', response.statusText);
        return;
      }

      const data = await response.json();
      const result = DeviceTokenResponseSchema.parse(data);

      if (result.success) {
        logger.info('Successfully unregistered device token from backend');
      } else {
        logger.warn('Failed to unregister device token from backend:', result.message);
      }
    } catch (error) {
      logger.error('Error unregistering device token from backend:', error);
    }
  }

  getExpoPushToken(): string | undefined {
    return this.expoPushToken;
  }
}

/**
 * Default instance of notification service
 *
 * Export singleton instance for convenience, but feature layer should
 * prefer dependency injection via context (see ServiceContext.tsx)
 */
export const notificationService = new NotificationServiceAdapter();
