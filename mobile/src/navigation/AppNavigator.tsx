import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';

import { HomeScreen } from '@/screens/HomeScreen';
import { CameraScreen } from '@/screens/CameraScreen';
import { GalleryScreen } from '@/screens/GalleryScreen';
import { JobsScreen } from '@/screens/JobsScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { EditScreen } from '@/screens/EditScreen';
import { PreviewScreen } from '@/screens/PreviewScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const TabNavigator = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      tabBarIcon: ({ focused, color, size }) => {
        let iconName: keyof typeof Ionicons.glyphMap;

        switch (route.name) {
          case 'Home':
            iconName = focused ? 'home' : 'home-outline';
            break;
          case 'Camera':
            iconName = focused ? 'camera' : 'camera-outline';
            break;
          case 'Gallery':
            iconName = focused ? 'images' : 'images-outline';
            break;
          case 'Jobs':
            iconName = focused ? 'list' : 'list-outline';
            break;
          case 'Settings':
            iconName = focused ? 'settings' : 'settings-outline';
            break;
          default:
            iconName = 'circle';
        }

        return <Ionicons name={iconName} size={size} color={color} />;
      },
      tabBarActiveTintColor: '#007AFF',
      tabBarInactiveTintColor: 'gray',
      headerShown: false,
    })}
  >
    <Tab.Screen name="Home" component={HomeScreen} />
    <Tab.Screen name="Camera" component={CameraScreen} />
    <Tab.Screen name="Gallery" component={GalleryScreen} />
    <Tab.Screen name="Jobs" component={JobsScreen} />
    <Tab.Screen name="Settings" component={SettingsScreen} />
  </Tab.Navigator>
);

export const AppNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false }}>
    <Stack.Screen name="Tabs" component={TabNavigator} />
    <Stack.Screen
      name="Edit"
      component={EditScreen}
      options={{ presentation: 'modal' }}
    />
    <Stack.Screen
      name="Preview"
      component={PreviewScreen}
      options={{ presentation: 'modal' }}
    />
  </Stack.Navigator>
);