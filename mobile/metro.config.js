// Shares ../src/lib (types, parsers, analysis, ask, household crypto) with the web app.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const root = path.resolve(__dirname, '..');
const config = getDefaultConfig(__dirname);
config.watchFolders = [path.join(root, 'src')];
config.resolver.nodeModulesPaths = [path.join(__dirname, 'node_modules')];
config.resolver.extraNodeModules = { '@': path.join(root, 'src') };
module.exports = config;
