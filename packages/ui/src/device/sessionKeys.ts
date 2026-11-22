/**
 * As chaves que o `@vuumbora/api-client` grava no cofre (`storageKeys` em `session-storage.ts`), repetidas AQUI porque o
 * `storageKeys` não sai do `index` do pacote e o ui não depende dele. Quem precisa saber a lista é a primeira execução
 * do cofre: ela só apaga o que é do app (`createGuardedSessionStorage`).
 *
 * Duas listas que precisam concordar são um risco: `test/sessionKeys.test.ts` lê o `storageKeys` de verdade e reprova se
 * o api-client ganhar, perder ou renomear uma chave sem este arquivo acompanhar. Só `[A-Za-z0-9._-]` (limite do SecureStore).
 */
export type DeviceAccountType = 'passenger' | 'driver';

export function deviceSessionKeys(accountType: DeviceAccountType): readonly string[] {
  return [
    `vuumbora.${accountType}.session`,
    `vuumbora.${accountType}.installation_id`,
    `vuumbora.${accountType}.pending_revocations`,
  ];
}

/** Marcador "o cofre já foi conferido nesta instalação" (armazenamento comum; some com a desinstalação). */
export function installMarkerKey(accountType: DeviceAccountType): string {
  return `vuumbora.${accountType}.vault_checked`;
}
