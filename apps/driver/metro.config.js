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

// Perfil de build — VUUMBORA_BUILD_PROFILE = development | preview | production.
// `production` é o build de loja: as telas de desenvolvimento (`app/catalogo.tsx`,
// `app/mapbox-check*.tsx`) saem do bundle por inteiro — não é `__DEV__` de runtime (que só
// esconderia a tela e deixaria o código, e o mapbox-gl, dentro do pacote). Sem a variável vale
// `development`, salvo no EAS Build, que já informa o perfil em EAS_BUILD_PROFILE. Valor
// inválido ABORTA: um "prod" digitado errado deixaria as telas de dev no app da loja em silêncio.
// O arquivo é idêntico em apps/passenger e apps/driver — mexeu aqui, mexa lá.
const BUILD_PROFILES = ['development', 'preview', 'production'];

function resolveBuildProfile() {
  const explicit = process.env.VUUMBORA_BUILD_PROFILE;
  if (explicit !== undefined && explicit !== '') {
    if (!BUILD_PROFILES.includes(explicit)) {
      throw new Error(
        `VUUMBORA_BUILD_PROFILE="${explicit}" é inválido. Use um destes: ${BUILD_PROFILES.join(', ')}.`,
      );
    }
    return explicit;
  }
  return process.env.EAS_BUILD_PROFILE === 'production' ? 'production' : 'development';
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const config = getDefaultConfig(__dirname);

if (resolveBuildProfile() === 'production') {
  // `resolver.blockList` também alimenta o mapa de arquivos do Metro (createFileMap), que é de onde
  // o Expo Router monta a lista de rotas — por isso a rota some, não só o import.
  const devOnlyRoutes = new RegExp(
    `^${escapeRegExp(path.join(__dirname, 'app'))}[\\\\/](catalogo\\.tsx|mapbox-check(\\.web)?\\.tsx)$`,
  );
  config.resolver.blockList = [].concat(config.resolver.blockList ?? [], devOnlyRoutes);
}

module.exports = config;
