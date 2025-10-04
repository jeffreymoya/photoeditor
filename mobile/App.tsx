import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { Provider } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { store } from '@/store';
import { AppNavigator } from '@/navigation/AppNavigator';
import { notificationService } from '@/services/NotificationService';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Initialize notification service
notificationService.initialize();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Provider store={store}>
        <SafeAreaProvider>
          <NavigationContainer>
            <ErrorBoundary>
              <AppNavigator />
              <StatusBar style="auto" />
            </ErrorBoundary>
          </NavigationContainer>
        </SafeAreaProvider>
      </Provider>
    </GestureHandlerRootView>
  );
}