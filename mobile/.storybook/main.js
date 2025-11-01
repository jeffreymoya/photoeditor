/**
 * Storybook for React Native configuration
 * Aligns with standards/frontend-tier.md#ui-components-layer requirements
 */

module.exports = {
  stories: [
    '../src/components/**/*.stories.?(ts|tsx|js|jsx)',
    '../src/features/**/*.stories.?(ts|tsx|js|jsx)',
  ],
  addons: [
    '@storybook/addon-a11y',
    '@storybook/addon-interactions',
    '@storybook/addon-react-native-web',
  ],
};
