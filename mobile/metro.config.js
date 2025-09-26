const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable support for shared packages in monorepo
config.resolver.nodeModulesPath = [
  require('path').resolve(__dirname, 'node_modules'),
  require('path').resolve(__dirname, '../shared/node_modules'),
];

module.exports = config;