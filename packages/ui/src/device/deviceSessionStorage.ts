/**
 * Armazenamento da sessão no WEB (e em qualquer alvo sem `.native`): SÓ MEMÓRIA, de propósito.
 *
 * O web é prévia de desenvolvimento (a entrega é Android/iOS, plano de execução A3): a sessão some ao recarregar a
 * página. NUNCA `localStorage`, `sessionStorage`, `indexedDB` nem cookie — qualquer script da página leria o refresh
 * token. `test/webSessionStorage.test.ts` varre este arquivo atrás desses nomes e exercita a porta com um
 * `localStorage`/`sessionStorage` que explode a qualquer acesso.
 *
 * Este arquivo NÃO importa módulo nativo: o `expo-secure-store` só existe em `deviceSessionStorage.native.ts`, que o
 * Metro troca por este no iOS/Android. É o que mantém o export web funcionando (o módulo não tem porta web).
 */
import type { CreateDeviceSessionStorage } from './deviceSessionStorage.types';

export type { CreateDeviceSessionStorage } from './deviceSessionStorage.types';

export const createDeviceSessionStorage: CreateDeviceSessionStorage = () => {
  const items = new Map<string, string>();
  return {
    ready: async () => undefined,
    getItem: async (key) => items.get(key) ?? null,
    setItem: async (key, value) => {
      items.set(key, value);
    },
    removeItem: async (key) => {
      items.delete(key);
    },
  };
};
