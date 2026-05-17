const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Preserve Expo defaults, then add monorepo workspace root.
config.watchFolders = [...new Set([...(config.watchFolders ?? []), workspaceRoot])];

// Preserve Expo defaults, then add monorepo node_modules paths.
config.resolver.nodeModulesPaths = [
  ...new Set([
    ...(config.resolver.nodeModulesPaths ?? []),
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
  ]),
];

module.exports = withNativeWind(config, { input: './global.css' });
