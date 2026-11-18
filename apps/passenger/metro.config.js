// Expo SDK 52+ detecta monorepo (npm workspaces) e configura watchFolders/nodeModulesPaths sozinho.
// Só personalize aqui com motivo registrado em docs/decisions.md.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
