const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Enable support for shared packages in monorepo
config.resolver.nodeModulesPath = [
  require('node:path').resolve(__dirname, 'node_modules'),
  require('node:path').resolve(__dirname, '../shared/node_modules'),
];

// Enable NativeWind v5 CSS processing
module.exports = withNativeWind(config, {
  input: './global.css',
});