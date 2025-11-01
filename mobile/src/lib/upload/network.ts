/**
 * Network connectivity utilities for upload resilience
 * Implements NetInfo-based pause/resume
 */

import NetInfo, { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';

/**
 * Network quality levels for metered connection handling
 */
export enum NetworkQuality {
  OFFLINE = 'offline',
  POOR = 'poor',
  GOOD = 'good',
  EXCELLENT = 'excellent',
}

/**
 * Network status for upload decisions
 */
export interface NetworkStatus {
  /**
   * Whether device is connected to internet
   */
  isConnected: boolean;
  /**
   * Whether connection is metered (cellular)
   */
  isMetered: boolean;
  /**
   * Network quality level
   */
  quality: NetworkQuality;
  /**
   * Connection type (wifi, cellular, etc)
   */
  type: NetInfoStateType;
}

/**
 * Determines network quality based on NetInfo state
 *
 * @param state - NetInfo state object
 * @returns Network quality level
 */
function determineQuality(state: NetInfoState): NetworkQuality {
  if (!state.isConnected) {
    return NetworkQuality.OFFLINE;
  }

  // For cellular connections, consider as POOR to prevent large uploads
  if (state.type === 'cellular') {
    return NetworkQuality.POOR;
  }

  // For WiFi, default to GOOD (could be enhanced with speed tests)
  if (state.type === 'wifi') {
    return NetworkQuality.GOOD;
  }

  // Unknown/other types
  return NetworkQuality.POOR;
}

/**
 * Gets current network status
 *
 * @returns Current network status
 */
export async function getNetworkStatus(): Promise<NetworkStatus> {
  const state = await NetInfo.fetch();

  return {
    isConnected: state.isConnected ?? false,
    isMetered: state.type === 'cellular',
    quality: determineQuality(state),
    type: state.type,
  };
}

/**
 * Subscribes to network status changes
 *
 * @param callback - Called when network status changes
 * @returns Unsubscribe function
 */
export function subscribeToNetworkStatus(
  callback: (status: NetworkStatus) => void
): () => void {
  return NetInfo.addEventListener(state => {
    const status: NetworkStatus = {
      isConnected: state.isConnected ?? false,
      isMetered: state.type === 'cellular',
      quality: determineQuality(state),
      type: state.type,
    };
    callback(status);
  });
}

/**
 * Checks if current network is suitable for uploads
 *
 * @param allowMetered - Whether to allow uploads on metered connections. Default: false
 * @returns True if network is suitable for upload
 */
export async function isNetworkSuitableForUpload(
  allowMetered: boolean = false
): Promise<boolean> {
  const status = await getNetworkStatus();

  if (!status.isConnected) {
    return false;
  }

  if (status.isMetered && !allowMetered) {
    return false;
  }

  return status.quality !== NetworkQuality.OFFLINE;
}

/**
 * Waits for network connectivity to be restored
 *
 * @param timeout - Maximum wait time in milliseconds. Default: 30000 (30s)
 * @returns True if network became available, false if timeout
 */
export async function waitForNetwork(timeout: number = 30000): Promise<boolean> {
  return new Promise((resolve) => {
    const startTime = Date.now();

    const unsubscribe = subscribeToNetworkStatus(status => {
      if (status.isConnected) {
        unsubscribe();
        resolve(true);
      } else if (Date.now() - startTime >= timeout) {
        unsubscribe();
        resolve(false);
      }
    });

    // Check immediately in case already connected
    getNetworkStatus().then(status => {
      if (status.isConnected) {
        unsubscribe();
        resolve(true);
      }
    });
  });
}
