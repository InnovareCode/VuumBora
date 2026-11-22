/**
 * O ÚNICO cliente de identidade do app do motorista (fatia B2). Tudo que fala de conta — criar a conta, código, login,
 * recuperação, sair, estado da sessão — passa por `identity`; nenhuma tela monta o próprio cliente.
 *
 * CONTA NÃO É CADASTRO DE MOTORISTA. Este cliente cuida só da CONTA (e-mail, senha, aceite dos documentos legais), com
 * `accountType: 'driver'`. O cadastro de motorista (documentos, veículo, análise) é outra etapa, que só abre depois que
 * as regras de taxa e repasse forem publicadas (plano de execução, princípio 5). Nada neste arquivo o abre.
 *
 * ESTADO ATUAL (B2): `mode: 'mock'` + armazenamento em MEMÓRIA.
 *  - O mock segue as regras e os códigos de erro do contrato (`docs/contrato-identidade-apps.md`); o código de
 *    e-mail dele é sempre `123456` (por isso a tela do código avisa, enquanto `identity.mode === 'mock'`).
 *  - Em memória, a sessão some ao fechar o app: o cofre seguro (SecureStore) é a fatia A3, e a API real em HTTPS
 *    é a B4. Quem trocar uma dessas coisas troca AQUI, num lugar só — as telas só leem `identity.mode`.
 *
 * Fatias que mexem neste arquivo:
 *  - A3: `storage` passa a ser a implementação do SecureStore (nativo) / memória (web).
 *  - B4: `IDENTITY_MODE` vira `'http'` com `baseUrl` vindo de `EXPO_PUBLIC_API_URL`.
 *
 * GUARDA DE BUILD (`metro.config.js`): build `production` com `IDENTITY_MODE !== 'http'` ABORTA, porque o modo
 * simulado não autentica ninguém. O `metro.config.js` lê a declaração `const IDENTITY_MODE = '...'` DESTE arquivo
 * por texto: mantenha UMA declaração, com literal entre aspas. Se a B4 mudar a forma (ex.: ler de variável de
 * ambiente), a build de produção aborta por "modo desconhecido" até a guarda ser atualizada junto — falha
 * fechada de propósito. O escape `VUUMBORA_ALLOW_MOCK_IDENTITY_IN_PRODUCTION=1` é temporário (export da A1) e
 * morre quando este modo virar `'http'` (nos DOIS apps).
 */
import { uuid } from 'expo';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  createIdentityClient,
  createMemorySessionStorage,
  type DevicePlatform,
  type IdentityClient,
  type MockLegalVersions,
} from '@vuumbora/api-client/identity';

/**
 * Mock com atraso artificial: dá para ver o estado "carregando" (e testar o duplo toque) sem API.
 * Lido por texto pela guarda de build do `metro.config.js` — ver o aviso no topo do arquivo.
 */
const IDENTITY_MODE = 'mock' as const;
const MOCK_LATENCY_MS = 350;

/**
 * Catálogo de versões dos Termos/Política DO MOCK, mutável de propósito (o mock o lê a cada chamada): a revisão troca
 * `terms`/`privacy` pelo gancho abaixo para simular "o jurídico publicou uma versão nova" (409 no cadastro da conta,
 * aceite pendente no `me`). SÓ em desenvolvimento: fora de `__DEV__` o mock usa o catálogo padrão dele. NÃO é versão
 * do app: a tela nunca lê isto — ela recebe as versões do `identity.legalCurrent()` e envia ESSAS
 * (`src/legal/legalModel.ts`).
 */
const mockLegal: MockLegalVersions | undefined = __DEV__ ? { terms: 'mock-1', privacy: 'mock-1' } : undefined;

function devicePlatform(): DevicePlatform {
  // `Platform.OS` também pode ser 'windows' | 'macos': o contrato só conhece estas três.
  return Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web';
}

function appVersion(): string | undefined {
  const version = Constants.expoConfig?.version;
  return typeof version === 'string' && version.length > 0 ? version : undefined;
}

function createDriverIdentity(): IdentityClient {
  return createIdentityClient({
    mode: IDENTITY_MODE,
    accountType: 'driver',
    platform: devicePlatform(),
    ...(appVersion() !== undefined ? { appVersion: appVersion() as string } : {}),
    // Explícito (e não o padrão do pacote) para a A3 ter um único ponto de troca.
    storage: createMemorySessionStorage(),
    // O Hermes não tem `crypto` global: `uuid` do `expo` usa o gerador nativo (e `crypto.randomUUID` no web).
    randomId: () => uuid.v4(),
    mock: { latencyMs: MOCK_LATENCY_MS, ...(mockLegal !== undefined ? { legal: mockLegal } : {}) },
    // O armazenamento nunca devolve o conteúdo no erro (só o erro): seguro registrar o motivo.
    onStorageError: (error) => {
      console.warn('[identity] armazenamento da sessão falhou', error instanceof Error ? error.name : 'erro');
    },
  });
}

export const identity: IdentityClient = createDriverIdentity();

// Gancho de prova, SÓ em desenvolvimento no web (`__DEV__` é removido do bundle de produção): permite à revisão
// forçar respostas que o mock não produz (503, sem rede) e acionar `session_expired`, e trocar as versões legais do
// mock (`__vuumboraMockLegal.terms = 'mock-2'`). Nunca existe no app da loja.
if (__DEV__ && Platform.OS === 'web') {
  const hooks = globalThis as { __vuumboraIdentity?: IdentityClient; __vuumboraMockLegal?: MockLegalVersions };
  hooks.__vuumboraIdentity = identity;
  if (mockLegal !== undefined) hooks.__vuumboraMockLegal = mockLegal;
}
