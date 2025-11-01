/**
 * Notification Service Port Interface
 *
 * Defines the contract for notification operations per the Frontend Tier standard:
 * - 100% of external calls behind interface in services port files
 * - Enables testability via stub implementations
 * - Isolates platform APIs (Expo Notifications) from feature and component layers
 */

/**
 * Notification Service Port - Contract for all notification operations
 *
 * Per the Frontend Tier standard Services & Integration Layer:
 * - Ports & Adapters (Hexagonal) for API/Notifications/Platform
 * - Expo Notifications with a thin adapter
 * - 100% of external calls behind interface in services port files
 */
export interface INotificationService {
  /**
   * Initialize notification service
   *
   * - Registers for push notifications
   * - Sets up notification listeners
   * - Registers device token with backend
   */
  initialize(): Promise<void>;

  /**
   * Schedule a job completion notification
   *
   * @param jobId - ID of the completed job
   * @param prompt - The AI prompt used for processing
   */
  scheduleJobCompletionNotification(jobId: string, prompt: string): Promise<void>;

  /**
   * Schedule a local notification
   *
   * @param title - Notification title
   * @param body - Notification body text
   * @param data - Optional structured data payload
   */
  scheduleLocalNotification(
    title: string,
    body: string,
    data?: Record<string, unknown>
  ): Promise<void>;

  /**
   * Cancel all scheduled notifications
   */
  cancelAllNotifications(): Promise<void>;

  /**
   * Unregister device token from backend
   *
   * Called when user logs out or disables notifications
   */
  unregisterFromBackend(): Promise<void>;

  /**
   * Get the current Expo push token
   *
   * @returns Push token or undefined if not registered
   */
  getExpoPushToken(): string | undefined;
}
