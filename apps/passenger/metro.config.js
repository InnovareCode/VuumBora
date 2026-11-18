// Expo SDK 52+ detecta monorepo (npm workspaces) e configura watchFolders/nodeModulesPaths sozinho.
// Só personalize aqui com motivo registrado em docs/decisions.md.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

// Carrega o .env da RAIZ do monorepo (fonte única de token, docs/mapbox.md) — o
// @expo/env embutido no CLI só olha para `__dirname` (este app), nunca sobe
// diretórios, então sem isto EXPO_PUBLIC_MAPBOX_TOKEN chega vazio no bundle.
// Não sobrescreve variável já definida no ambiente (mesma regra do próprio Expo).
// Pendência: registrar esta decisão em docs/decisions.md (D-11, fora da fronteira
// do Vulcano — pedir à Nova/Atlas).
require('@expo/env').load(path.resolve(__dirname, '../..'));

module.exports = getDefaultConfig(__dirname);
