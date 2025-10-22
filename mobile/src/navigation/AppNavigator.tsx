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

const tabIconMap: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
  Home: { active: 'home', inactive: 'home-outline' },
  Camera: { active: 'camera', inactive: 'camera-outline' },
  Gallery: { active: 'images', inactive: 'images-outline' },
  Jobs: { active: 'list', inactive: 'list-outline' },
  Settings: { active: 'settings', inactive: 'settings-outline' },
};

const getTabIcon = (routeName: string, focused: boolean): keyof typeof Ionicons.glyphMap => {
  const icons = tabIconMap[routeName];
  if (!icons) {
    return 'help-circle';
  }

  return focused ? icons.active : icons.inactive;
};

const TabNavigator = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      tabBarIcon: ({ focused, color, size }) => (
        <Ionicons name={getTabIcon(route.name, focused)} size={size} color={color} />
      ),
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
