/**
 * Storybook entry point for React Native
 * This file is the main entry for the Storybook UI in the mobile app
 */

 
import { getStorybookUI } from '@storybook/react-native';

import './storybook.requires';

const StorybookUIRoot = getStorybookUI({
  // Enable accessibility addon
  enableWebsockets: true,
  // Show Storybook UI in the app
  shouldPersistSelection: true,
});

export default StorybookUIRoot;
