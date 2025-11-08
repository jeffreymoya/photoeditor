import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ServiceProvider } from '@/features/upload/context/ServiceContext';
import { AppNavigator } from '@/navigation/AppNavigator';
import { notificationService } from '@/services/notification/adapter';
import { store } from '@/store';

export function App(): React.JSX.Element {
  useEffect(() => {
    void notificationService.initialize();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Provider store={store}>
        <SafeAreaProvider>
          <ServiceProvider>
            <NavigationContainer>
              <ErrorBoundary>
                <AppNavigator />
                <StatusBar style="auto" />
              </ErrorBoundary>
            </NavigationContainer>
          </ServiceProvider>
        </SafeAreaProvider>
      </Provider>
    </GestureHandlerRootView>
  );
}
