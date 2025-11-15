const path = require('path');

/**
 * Storybook for React Native configuration
 * Aligns with standards/frontend-tier.md#ui-components-layer requirements
 */

module.exports = {
  stories: [
    '../src/components/**/*.stories.?(ts|tsx|js|jsx)',
    '../src/features/**/*.stories.?(ts|tsx|js|jsx)',
  ],
  framework: {
    name: '@storybook/react-webpack5',
    options: {},
  },
  addons: [
    '@storybook/addon-a11y',
    '@storybook/addon-interactions',
    '@storybook/addon-react-native-web',
  ],
  webpackFinal: async (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'react-native-vision-camera': path.resolve(
        __dirname,
        'stubs/react-native-vision-camera.tsx'
      ),
      'react-native-worklets-core': path.resolve(
        __dirname,
        'stubs/react-native-worklets-core.js'
      ),
    };
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      console: require.resolve('console-browserify'),
    };
    return config;
  },
};
