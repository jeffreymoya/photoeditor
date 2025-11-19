const createNativewindPreset = require('react-native-css/babel').default;

const isStorybookBuild = process.env.STORYBOOK_BUILD === '1';
const stubParserPlugin = () => ({ name: 'storybook-parser-override-stub' });

if (isStorybookBuild) {
  ['react-native-worklets/plugin', 'react-native-reanimated/plugin'].forEach((moduleName) => {
    try {
      const modulePath = require.resolve(moduleName);
      require.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports: stubParserPlugin,
      };
    } catch {
      // Module not present; ignore
    }
  });
}

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      isStorybookBuild
        ? ['babel-preset-expo', { reanimated: false }]
        : 'babel-preset-expo',
    ],
    plugins: [
      ...(createNativewindPreset(api).plugins || []).filter(
        (plugin) =>
          !isStorybookBuild || plugin !== 'react-native-worklets/plugin'
      ),
      [
        'module-resolver',
        {
          root: ['./src'],
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
          alias: {
            '@': './src',
            '@/components': './src/components',
            '@/screens': './src/screens',
            '@/services': './src/services',
            '@/hooks': './src/hooks',
            '@/types': './src/types',
            '@/utils': './src/utils',
            '@/store': './src/store',
            '@/constants': './src/constants',
            '@/assets': './assets',
          },
        },
      ],
    ],
  };
};
