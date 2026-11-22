/**
 * O ÚNICO cliente de identidade do app do passageiro (fatia B1). Tudo que fala de conta — cadastro, código,
 * login, recuperação, sair, estado da sessão — passa por `identity`; nenhuma tela monta o próprio cliente.
 *
 * ESTADO ATUAL (F02/B4): o modo (`mock` ou `http`) é decidido por TROCA DE MÓDULO, não por um valor runtime
 * neste arquivo — ver `./mode.ts` para o contrato e o porquê. Resumo: `development` usa `./mode.mock`
 * (dados de demonstração, sem API nem banco — é o que a F09/Íris precisam para capturas e baterias sem
 * infra de pé); `preview`/`production` usam `./mode.http` (API real, `baseUrl` de `EXPO_PUBLIC_API_URL`,
 * `https` obrigatório). Em desenvolvimento, `VUUMBORA_IDENTITY=http` no ambiente real força `./mode.http`
 * para testar contra uma API local.
 *  - `storage` é `createDeviceSessionStorage` (`@vuumbora/ui`, `src/device/`): no iOS/Android o `expo-secure-store`
 *    (Keychain/Keystore), com a limpeza da primeira execução depois de instalar (o Keychain do iOS sobrevive à
 *    desinstalação); no web SÓ memória (a sessão some ao recarregar a página; nunca localStorage/sessionStorage).
 *  - Em `http`, "fechar à força e reabrir mantém a sessão" (o servidor não vive na memória do processo, ao
 *    contrário do mock).
 *
 * GUARDA DE BUILD (`metro.config.js`): `preview`/`production` com o resolver NÃO apontando `./mode` para
 * `./mode.http` ABORTA, sem escape — o modo simulado não autentica ninguém.
 */
import { uuid } from 'expo';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { createIdentityClient, type DevicePlatform, type IdentityClient } from '@vuumbora/api-client/identity';
import { createDeviceSessionStorage } from '@vuumbora/ui';
import { identityModeConfig } from './mode';

function devicePlatform(): DevicePlatform {
  // `Platform.OS` também pode ser 'windows' | 'macos': o contrato só conhece estas três.
  return Platform.OS === 'android' || Platform.OS === 'ios' ? Platform.OS : 'web';
}

function appVersion(): string | undefined {
  const version = Constants.expoConfig?.version;
  return typeof version === 'string' && version.length > 0 ? version : undefined;
}

function createPassengerIdentity(): IdentityClient {
  return createIdentityClient({
    ...identityModeConfig(),
    accountType: 'passenger',
    platform: devicePlatform(),
    ...(appVersion() !== undefined ? { appVersion: appVersion() as string } : {}),
    // Cofre do aparelho (A3). Um por processo: guarda a verificação da primeira execução, que roda uma vez.
    storage: createDeviceSessionStorage({ accountType: 'passenger' }),
    // O Hermes não tem `crypto` global: `uuid` do `expo` usa o gerador nativo (e `crypto.randomUUID` no web).
    randomId: () => uuid.v4(),
    // O armazenamento nunca devolve o conteúdo no erro (só o erro): seguro registrar o motivo.
    onStorageError: (error) => {
      console.warn('[identity] armazenamento da sessão falhou', error instanceof Error ? error.name : 'erro');
    },
  });
}

export const identity: IdentityClient = createPassengerIdentity();

// Gancho de prova, SÓ em desenvolvimento no web (`__DEV__` é removido do bundle de produção): permite à revisão
// trocar métodos do cliente na hora (ex.: `__vuumboraIdentity.register = async () => ({...})`) para forçar respostas
// que a API local não produz (503, sem rede, `invalid_body`). Nunca existe no app da loja.
if (__DEV__ && Platform.OS === 'web') {
  const hooks = globalThis as { __vuumboraIdentity?: IdentityClient };
  hooks.__vuumboraIdentity = identity;
}
