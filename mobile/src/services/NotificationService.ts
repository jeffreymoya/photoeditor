import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import { apiService } from './ApiService';
import { logger } from '../utils/logger';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class NotificationService {
  private expoPushToken: string | undefined = undefined;

  async initialize() {
    await this.registerForPushNotificationsAsync();
    this.setupNotificationListeners();

    // Register with backend if we have a token
    if (this.expoPushToken) {
      await this.registerWithBackend();
    }
  }

  private async registerForPushNotificationsAsync() {
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
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }
  }

  private setupNotificationListeners() {
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

  private handleJobNotification(data: Record<string, unknown>, isUserInteraction: boolean = false) {
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

  async scheduleJobCompletionNotification(jobId: string, prompt: string) {
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
  ) {
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

  async cancelAllNotifications() {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  private async registerWithBackend() {
    if (!this.expoPushToken) {
      logger.warn('No push token available for backend registration');
      return;
    }

    try {
      const deviceId = await this.getDeviceId();
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';

      const response = await apiService.registerDeviceToken(
        this.expoPushToken,
        platform,
        deviceId
      );

      if (response.success) {
        logger.info('Successfully registered device token with backend');
      } else {
        logger.warn('Failed to register device token with backend:', response.message);
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

  async unregisterFromBackend() {
    try {
      const deviceId = await this.getDeviceId();
      const response = await apiService.deactivateDeviceToken(deviceId);

      if (response.success) {
        logger.info('Successfully unregistered device token from backend');
      } else {
        logger.warn('Failed to unregister device token from backend:', response.message);
      }
    } catch (error) {
      logger.error('Error unregistering device token from backend:', error);
    }
  }

  getExpoPushToken() {
    return this.expoPushToken;
  }
}

export const notificationService = new NotificationService();