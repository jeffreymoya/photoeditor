const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable support for shared packages in monorepo
config.resolver.nodeModulesPath = [
  require('node:path').resolve(__dirname, 'node_modules'),
  require('node:path').resolve(__dirname, '../shared/node_modules'),
];

module.exports = config;