import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class NotificationService {
  private expoPushToken: string | null = null;

  async initialize() {
    await this.registerForPushNotificationsAsync();
    this.setupNotificationListeners();
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
      console.log('Failed to get push token for push notification!');
      return;
    }

    try {
      token = (await Notifications.getExpoPushTokenAsync()).data;
      this.expoPushToken = token;
      await AsyncStorage.setItem('expo_push_token', token);
      console.log('Expo push token:', token);
    } catch (error) {
      console.error('Error getting push token:', error);
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
      console.log('Notification received:', notification);
    });

    // Handle notification interactions
    Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('Notification response:', response);

      // Handle job completion notifications
      const data = response.notification.request.content.data;
      if (data.type === 'job_completed') {
        // Navigate to job details or processed image
        // This would need to be connected to your navigation system
      }
    });
  }

  async scheduleJobCompletionNotification(jobId: string, prompt: string) {
    if (!this.expoPushToken) {
      console.log('No push token available');
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
    data?: Record<string, any>
  ) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
      },
      trigger: null,
    });
  }

  async cancelAllNotifications() {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }

  getExpoPushToken() {
    return this.expoPushToken;
  }
}

export const NotificationService = new NotificationService();