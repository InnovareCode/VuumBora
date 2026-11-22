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
//   • `preview` (distribuição interna) NÃO esconde telas de dev, mas (F02/B4) EXIGE identidade real
//     (`IDENTITY_MODE = 'http'`) e `EXPO_PUBLIC_API_URL` em https, igual à `production` — é o que o dono instala no
//     aparelho para testar de verdade, não pode levar login simulado. Uma build interna que rode com
//     NODE_ENV=production precisa declarar `VUUMBORA_BUILD_PROFILE=preview` para não cair em production.
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
 * O ambiente que a decisão do perfil pode ler: uma cópia de `env` em que cada `VUUMBORA_*` vale o que tinha
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
      `[vuumbora] ATENÇÃO: ${ignored.sort().join(', ')} veio de um arquivo .env e foi IGNORADA. O perfil de build ` +
        'só vale se vier do AMBIENTE do processo (eas.json, CI ou o terminal que roda o build), nunca de arquivo.',
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
// Modo da identidade (F02/B4) — TROCA DE MÓDULO, não um `if` em runtime. `identityClient.ts` importa
// `./mode`; este resolver intercepta ESSE pedido específico e o redireciona para `./mode.mock` ou
// `./mode.http` ANTES do Metro tentar resolver `./mode` de verdade — o arquivo perdedor nunca entra no
// grafo de dependências (ver o porquê em src/identity/mode.ts: um `if (mode === 'mock')` dentro de um
// arquivo só NÃO tira o código do branch morto do bundle, porque `identity.mode` só se resolve em
// runtime; a troca de módulo tira de verdade, em tempo de build).
//
// `development`: `./mode.mock` (dado de demonstração, sem API nem banco — é o que a F09/Íris precisam
// para capturas e baterias). `preview`/`production`: SEMPRE `./mode.http`, sem escape — identidade
// simulada não autentica ninguém numa build que sai do laptop. Em `development`, `VUUMBORA_IDENTITY=http`
// no ambiente REAL (nunca em `.env`, mesma regra do perfil de build) força `./mode.http` para testar
// contra uma API local.
// ───────────────────────────────────────────────────────────────────────────────────────────────
const IDENTITY_MODULE_SPECIFIER = './mode';
const IDENTITY_CLIENT_FILE_ABS = path.join(__dirname, 'src', 'identity', 'identityClient.ts');

function resolveIdentityModeTarget(profile, env) {
  if (profile === 'preview' || profile === 'production') return 'mode.http';

  const explicit = filled(env.VUUMBORA_IDENTITY);
  if (explicit === undefined) return 'mode.mock';
  if (explicit !== 'http' && explicit !== 'mock') {
    throw new Error(`VUUMBORA_IDENTITY="${explicit}" é inválida. Use "http" ou "mock" (ausente = mock).`);
  }
  return explicit === 'http' ? 'mode.http' : 'mode.mock';
}

function identityModeFileExists(target) {
  return fs.existsSync(path.join(__dirname, 'src', 'identity', `${target}.ts`));
}

/**
 * Guarda de identidade (F02/B4): build `preview` OU `production` cujo resolver NÃO aponte `./mode` para
 * `./mode.http` ABORTA, sem escape (mesmo desenho do `failBuildOnMockApi` de apps/admin/vite.config.ts). O
 * escape temporário `VUUMBORA_ALLOW_MOCK_IDENTITY_IN_PRODUCTION`, que existia aqui enquanto os dois apps
 * tinham `IDENTITY_MODE = 'mock'` fixo, morreu nesta fatia — não volta a existir sem decisão explícita.
 * Por construção `resolveIdentityModeTarget` já garante isto para estes dois perfis; esta função é o
 * cinto-e-suspensório que falha alto se algum dia isso deixar de ser verdade.
 */
function assertIdentityModeIsHttp(target, profile) {
  if (target === 'mode.http') return;
  throw new Error(
    `Build "${profile}" abortada: o resolver de identidade apontaria "./mode" para "./${target}.ts", não ` +
      '"./mode.http.ts". Preview e production não podem levar identidade simulada — sem escape: ' +
      'VUUMBORA_ALLOW_MOCK_IDENTITY_IN_PRODUCTION não existe mais (F02).',
  );
}

/**
 * Guarda de HTTPS (F02/B4): build `preview` ou `production` só pode falar com a API em `https:` — a build ABORTA
 * sem isso, para senha e tokens nunca viajarem em texto claro por causa de uma `EXPO_PUBLIC_API_URL` errada.
 * `EXPO_PUBLIC_API_URL` é pública (vai dentro do pacote; ver docs/producao-passo-a-passo-dono.md) e vem do
 * ambiente de cada perfil no EAS — nunca um valor fixo aqui.
 */
function assertApiUrlIsHttps(env, profile) {
  const apiUrl = filled(env.EXPO_PUBLIC_API_URL);
  if (apiUrl === undefined) {
    throw new Error(
      `Build "${profile}" abortada: EXPO_PUBLIC_API_URL não está definida. Defina-a (https) no ambiente do perfil "${profile}" no EAS.`,
    );
  }
  let parsed;
  try {
    parsed = new URL(apiUrl);
  } catch {
    throw new Error(`Build "${profile}" abortada: EXPO_PUBLIC_API_URL="${apiUrl}" não é uma URL válida.`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(
      `Build "${profile}" abortada: EXPO_PUBLIC_API_URL deve ser https (recebido "${parsed.protocol}"). ` +
        'Preview e production não podem falar com a API em texto claro.',
    );
  }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const buildEnv = buildEnvFrom(process.env, expoEnv.getOriginalEnvValue, (message) => console.warn(message));

const { profile, source } = resolveBuildProfile(buildEnv, Boolean(process.stdout.isTTY) && !process.env.CI);

const identityModeTarget = resolveIdentityModeTarget(profile, buildEnv);
if (!identityModeFileExists(identityModeTarget)) {
  throw new Error(
    `src/identity/${identityModeTarget}.ts não existe — o resolver de identidade não tem para onde redirecionar "./mode".`,
  );
}

const config = getDefaultConfig(__dirname);

// Intercepta SÓ o pedido "./mode" feito por identityClient.ts; tudo o mais segue a resolução padrão do Metro
// (`context.resolveRequest` é o algoritmo default — delegar para ele em vez de reimplementar resolução).
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === IDENTITY_MODULE_SPECIFIER && path.normalize(context.originModulePath) === IDENTITY_CLIENT_FILE_ABS) {
    return context.resolveRequest(context, `./${identityModeTarget}`, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

if (profile === 'preview' || profile === 'production') {
  // F02/B4: preview e production exigem identidade real e API em https — só production esconde as telas de dev
  // (abaixo). Preview é o que o dono instala no aparelho para testar de verdade.
  assertIdentityModeIsHttp(identityModeTarget, profile);
  assertApiUrlIsHttps(buildEnv, profile);
}

if (profile === 'production') {
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
