// Expo SDK 52+ detecta monorepo (npm workspaces) e configura watchFolders/nodeModulesPaths sozinho.
// Só personalize aqui com motivo registrado em docs/decisions.md.
const fs = require('fs');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const expoEnv = require('@expo/env');

// Carrega o .env da RAIZ do monorepo (fonte única de token, docs/mapbox.md) — o
// @expo/env embutido no CLI só olha para `__dirname` (este app), nunca sobe
// diretórios, então sem isto EXPO_PUBLIC_MAPBOX_TOKEN chega vazio no bundle.
// Não sobrescreve variável já definida no ambiente (mesma regra do próprio Expo).
// Isto vale para `EXPO_PUBLIC_*` e afins; as VUUMBORA_* do perfil de build NÃO vêm daqui (ver `buildEnvFrom`).
// Pendência: registrar esta decisão em docs/decisions.md (D-11, fora da fronteira
// do Vulcano — pedir à Nova/Atlas).
expoEnv.load(path.resolve(__dirname, '../..'));

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Perfil de build — VUUMBORA_BUILD_PROFILE = development | preview | production.
// O arquivo é idêntico em apps/passenger e apps/driver — mexeu aqui, mexa lá.
//
// `production` é o build de loja. Duas coisas valem só nele, e as duas FALHAM FECHADO:
//   1. as telas de desenvolvimento saem do bundle por inteiro (não é `__DEV__` de runtime, que só
//      esconderia a tela e deixaria o código, e o mapbox-gl, dentro do pacote);
//   2. identidade SIMULADA aborta o build (ver `assertIdentityIsNotMock`).
//
// Como o perfil é decidido (nesta ordem):
//   • VUUMBORA_BUILD_PROFILE preenchida: vale. Valor fora da lista ABORTA (um "prod" digitado errado
//     deixaria tudo isso de fora em silêncio). `development` com NODE_ENV=production ABORTA, e
//     `development`/`preview` com EAS_BUILD_PROFILE=production também (as duas variáveis se contradizem).
//   • Sem ela, o perfil é DERIVADO: EAS_BUILD_PROFILE=production ou NODE_ENV=production → `production`;
//     NODE_ENV=development|test → `development`. O Expo CLI define NODE_ENV antes de carregar este arquivo
//     (medido: `expo export` e `expo export:embed` → production; `expo start` → development), então uma
//     build de loja que esqueça a variável cai em `production`, nunca em `development`.
//   • Sem variável E sem NODE_ENV: só `development` se a sessão for interativa (terminal, sem CI). Numa build
//     não interativa isto ABORTA e pede o perfil explícito — mesma política de apps/admin/vite.config.ts.
//   • `preview` (distribuição interna) NÃO esconde telas de dev nem exige identidade real; uma build interna
//     que rode com NODE_ENV=production precisa declarar `VUUMBORA_BUILD_PROFILE=preview` para não cair em production.
//
// De ONDE a decisão lê: só do AMBIENTE REAL do processo (eas.json, CI, o terminal de quem roda o build) — o perfil é
// decisão de quem constrói, não de um arquivo que pode ter ficado na máquina. Qualquer `VUUMBORA_*` vindo de `.env*`
// (o da raiz, que o `load()` acima carrega, ou o deste app, que o Expo CLI carrega ANTES de ler este arquivo) é
// IGNORADO, com aviso e sem imprimir o valor. Ver `buildEnvFrom`.
// ───────────────────────────────────────────────────────────────────────────────────────────────
const BUILD_PROFILES = ['development', 'preview', 'production'];

/** Pasta-grupo do Expo Router (não entra na URL): tudo sob `app/(dev)/`, em qualquer nível, é tela de desenvolvimento. */
const DEV_ROUTE_GROUP = '(dev)';

function filled(value) {
  return value === undefined || value === '' ? undefined : value;
}

const BUILD_ENV_PREFIX = 'VUUMBORA_';

/**
 * O ambiente que a decisão do perfil e o escape podem ler: uma cópia de `env` em que cada `VUUMBORA_*` vale o que tinha
 * ANTES de qualquer `.env` ser carregado (`getOriginalEnvValue` do `@expo/env`, que guarda o valor original de toda chave
 * que um arquivo `.env*` tocou — tanto as que o CLI carregou antes deste arquivo quanto as do `load()` acima). Chave que só
 * existe por causa de arquivo some da cópia. As outras variáveis (`NODE_ENV`, `EAS_BUILD_PROFILE`...) passam como estão.
 *
 * Sem `getOriginalEnvValue` (versão do `@expo/env` que não a tem) ABORTA: sem ela não há como separar ambiente de arquivo, e
 * a guarda de loja não pode ficar mais fraca em silêncio — mesma política de falhar fechado do resto deste arquivo.
 *
 * `warn` recebe os NOMES das chaves ignoradas, nunca os valores. Chaves em caixa alta (Windows não diferencia caixa).
 */
function buildEnvFrom(env, getOriginalEnvValue, warn) {
  if (typeof getOriginalEnvValue !== 'function') {
    throw new Error(
      'A versão instalada de @expo/env não tem getOriginalEnvValue. Sem ela não dá para separar o ambiente real do que veio ' +
        'de um arquivo .env, e o perfil de build não pode aceitar VUUMBORA_* de arquivo. Atualize `buildEnvFrom` ' +
        '(apps/passenger/metro.config.js e apps/driver/metro.config.js, idênticos) antes de atualizar o Expo.',
    );
  }
  const trusted = {};
  const ignored = [];
  for (const key of Object.keys(env)) {
    if (!key.toUpperCase().startsWith(BUILD_ENV_PREFIX)) {
      trusted[key] = env[key];
      continue;
    }
    const original = getOriginalEnvValue(key);
    if (original === undefined) {
      if (filled(env[key]) !== undefined) ignored.push(key.toUpperCase());
      continue;
    }
    trusted[key.toUpperCase()] = original;
  }
  if (ignored.length > 0) {
    warn(
      `[vuumbora] ATENÇÃO: ${ignored.sort().join(', ')} veio de um arquivo .env e foi IGNORADA. O perfil de build e o escape ` +
        'só valem se vierem do AMBIENTE do processo (eas.json, CI ou o terminal que roda o build), nunca de arquivo.',
    );
  }
  return trusted;
}

function resolveBuildProfile(env, interactive) {
  const explicit = filled(env.VUUMBORA_BUILD_PROFILE);
  const nodeEnv = filled(env.NODE_ENV);
  const eas = filled(env.EAS_BUILD_PROFILE);

  if (explicit !== undefined) {
    if (!BUILD_PROFILES.includes(explicit)) {
      throw new Error(
        `VUUMBORA_BUILD_PROFILE="${explicit}" é inválido. Use um destes: ${BUILD_PROFILES.join(', ')}.`,
      );
    }
    if (explicit === 'development' && nodeEnv === 'production') {
      throw new Error(
        'VUUMBORA_BUILD_PROFILE=development com NODE_ENV=production: isto é uma build de release com as telas de ' +
          'desenvolvimento e a identidade simulada dentro. Use VUUMBORA_BUILD_PROFILE=production (loja) ou preview (interna).',
      );
    }
    if (explicit !== 'production' && eas === 'production') {
      throw new Error(
        `VUUMBORA_BUILD_PROFILE=${explicit} contradiz EAS_BUILD_PROFILE=production. Corrija o eas.json: o perfil de loja é production.`,
      );
    }
    return { profile: explicit, source: 'VUUMBORA_BUILD_PROFILE' };
  }

  if (eas === 'production') return { profile: 'production', source: 'EAS_BUILD_PROFILE' };
  if (nodeEnv === 'production') return { profile: 'production', source: 'NODE_ENV' };
  if (nodeEnv === 'development' || nodeEnv === 'test') return { profile: 'development', source: 'NODE_ENV' };
  if (nodeEnv === undefined) {
    if (interactive) return { profile: 'development', source: 'sessão interativa' };
    throw new Error(
      'Build não interativa sem perfil: nem VUUMBORA_BUILD_PROFILE nem NODE_ENV estão definidas. ' +
        `Defina VUUMBORA_BUILD_PROFILE com um destes: ${BUILD_PROFILES.join(', ')}.`,
    );
  }
  throw new Error(
    `NODE_ENV="${nodeEnv}" não é reconhecido (esperado development, test ou production). ` +
      `Defina VUUMBORA_BUILD_PROFILE com um destes: ${BUILD_PROFILES.join(', ')}.`,
  );
}

// ───────────────────────────────────────────────────────────────────────────────────────────────
// Guarda de identidade: build `production` com identidade SIMULADA aborta (mesmo desenho do
// `failBuildOnMockApi` de apps/admin/vite.config.ts).
//
// A fonte do modo é a declaração `const IDENTITY_MODE = '...'` de `src/identity/identityClient.ts` — uma
// só, lida daqui por texto, então a guarda e o app não podem divergir. Só passa com o literal 'http'.
// Arquivo ausente (o motorista ainda não tem cliente de identidade: a sessão dele é de demonstração),
// declaração duplicada ou que não seja um literal ('mock', 'http') ⇒ modo DESCONHECIDO ⇒ trata como mock.
// Quem trocar a forma da declaração (B4) vê o aborto e atualiza esta guarda junto.
//
// ESCAPE TEMPORÁRIO — VUUMBORA_ALLOW_MOCK_IDENTITY_IN_PRODUCTION=1.
// Existe só porque o export de produção da A1 precisa seguir verde enquanto `IDENTITY_MODE` é fixo em
// 'mock' (passageiro: troca na A3/B4; motorista: A2). NUNCA numa build de loja. Só o valor exato `1` vale
// (`true`, `yes`, `0` ou vazio NÃO liberam), e cada uso imprime um aviso. REMOVER: quando passageiro e
// motorista tiverem `IDENTITY_MODE = 'http'`, apague `MOCK_IDENTITY_ESCAPE` e o ramo que o lê.
// ───────────────────────────────────────────────────────────────────────────────────────────────
const IDENTITY_CLIENT_FILE = path.join('src', 'identity', 'identityClient.ts');
const MOCK_IDENTITY_ESCAPE = 'VUUMBORA_ALLOW_MOCK_IDENTITY_IN_PRODUCTION';

function readIdentityMode(appRoot) {
  let source;
  try {
    source = fs.readFileSync(path.join(appRoot, IDENTITY_CLIENT_FILE), 'utf8');
  } catch {
    return undefined;
  }
  const declaration = /^[ \t]*(?:export[ \t]+)?const[ \t]+IDENTITY_MODE[ \t]*(?::[^=\n]+)?=[ \t]*(['"])([A-Za-z_-]+)\1/gm;
  const found = [...source.matchAll(declaration)];
  return found.length === 1 ? found[0][2] : undefined;
}

function assertIdentityIsNotMock(appRoot, env, warn) {
  const mode = readIdentityMode(appRoot);
  if (mode === 'http') return;

  const reason =
    mode === undefined
      ? `não foi possível ler um único \`const IDENTITY_MODE = '...'\` literal em ${IDENTITY_CLIENT_FILE} (arquivo ausente ou fora do formato); sem isso o modo é tratado como simulado`
      : `IDENTITY_MODE vale '${mode}' em ${IDENTITY_CLIENT_FILE}`;

  if (env[MOCK_IDENTITY_ESCAPE] === '1') {
    warn(
      `[vuumbora] ATENÇÃO: build "production" com identidade SIMULADA liberada por ${MOCK_IDENTITY_ESCAPE}=1 (${reason}). ` +
        'Isto NÃO pode ir para a loja: o login não autentica ninguém. Escape temporário até a identidade real (A3/B4; motorista: A2).',
    );
    return;
  }
  throw new Error(
    `Build "production" abortada: ${reason}. A build de loja não pode levar identidade simulada. ` +
      `Troque para identidade real ('http'). Só para exportar/provar a A1 e SÓ enquanto a identidade real não chega: ${MOCK_IDENTITY_ESCAPE}=1.`,
  );
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const buildEnv = buildEnvFrom(process.env, expoEnv.getOriginalEnvValue, (message) => console.warn(message));

const { profile, source } = resolveBuildProfile(buildEnv, Boolean(process.stdout.isTTY) && !process.env.CI);

const config = getDefaultConfig(__dirname);

if (profile === 'production') {
  assertIdentityIsNotMock(__dirname, buildEnv, (message) => console.warn(message));

  // `resolver.blockList` também alimenta o mapa de arquivos do Metro (createFileMap), que é de onde
  // o Expo Router monta a lista de rotas — por isso a rota some, não só o import. A convenção é a pasta
  // `app/(dev)/` (em qualquer nível): tela de desenvolvimento nova nasce lá e já fica fora da loja, sem
  // editar lista. Não entra na URL (grupo do Expo Router): `/catalogo` e `/mapbox-check` seguem iguais.
  const appDir = path.join(__dirname, 'app').split(/[\\/]/).map(escapeRegExp).join('[\\\\/]');
  const devOnlyRoutes = new RegExp(`^${appDir}(?:[\\\\/].*)?[\\\\/]${escapeRegExp(DEV_ROUTE_GROUP)}[\\\\/]`);
  config.resolver.blockList = [].concat(config.resolver.blockList ?? [], devOnlyRoutes);

  console.warn(`[vuumbora] perfil de build: production (origem: ${source}) — telas de ${DEV_ROUTE_GROUP} fora do bundle.`);
}

module.exports = config;
