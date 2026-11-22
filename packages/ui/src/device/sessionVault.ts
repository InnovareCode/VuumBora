/**
 * Guarda do cofre da sessão (A3) — PURO: sem React Native, sem Expo. O cofre e o marcador entram por injeção, e é por
 * isso que dá para provar tudo com `node --import tsx` e um cofre falso (ver `test/`).
 *
 * O PROBLEMA QUE ISTO RESOLVE (iOS): o Keychain SOBREVIVE à desinstalação do app; o resto do sandbox (inclusive o
 * `NSUserDefaults`) não. Sem cuidado, quem apaga o app e instala de novo reabre com a sessão (e o `installationId`) da
 * instalação anterior — o refresh token de uma pessoa continuaria valendo num app "novo" (aparelho vendido, emprestado).
 *
 * A DECISÃO (recomendação do plano de execução, A3): na PRIMEIRA operação depois de instalar, apagar o que houver no
 * cofre, usando um MARCADOR em armazenamento comum (que some junto com a desinstalação):
 *
 *   marcador ausente  → instalação nova (ou reinstalação): apaga as chaves do app no cofre, DEPOIS grava o marcador;
 *   marcador presente → o cofre é desta instalação: não apaga nada.
 *
 * Regras que o código segura (cada uma tem teste que quebra se ela for desfeita):
 *  - a ordem é apagar → marcar. Marcar primeiro e falhar no apagar deixaria o Keychain velho "aprovado" para sempre;
 *  - falhou apagar UMA chave, o marcador NÃO é gravado e a operação REJEITA (o api-client trata a rejeição sem derrubar
 *    a sessão em memória, e a próxima abertura tenta de novo). Todas as chaves são tentadas mesmo se uma falhar;
 *  - não conseguir LER o marcador também rejeita (falha fechada: sem saber se é reinstalação, o cofre não é confiável);
 *  - NENHUMA leitura nem escrita passa antes de a verificação terminar: uma escrita nunca é apagada pelo apagar inicial
 *    (nem uma leitura devolve o que seria apagado);
 *  - só as chaves informadas em `keysToWipe` são tocadas (nunca o cofre inteiro, nunca as do outro perfil);
 *  - Android: `marker: null`. Lá desinstalar apaga o arquivo do SecureStore junto com o app (e o plugin do
 *    `expo-secure-store` exclui esse arquivo do backup automático), então não há o que limpar.
 */

/** Mesma forma de `SessionStoragePort` do `@vuumbora/api-client` (estrutural: o ui não depende do api-client). */
export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Armazenamento comum (apagado na desinstalação) que diz "este cofre já foi conferido nesta instalação". */
export interface InstallMarker {
  isSet(): Promise<boolean>;
  set(): Promise<void>;
}

export interface GuardedSessionStorage extends KeyValueStorage {
  /** Termina a verificação da primeira execução. Idempotente; rejeita se a verificação falhou (a próxima chamada tenta de novo). */
  ready(): Promise<void>;
}

export interface GuardedStorageOptions {
  readonly vault: KeyValueStorage;
  /** `null` = plataforma sem o problema (Android, web): nada a verificar. */
  readonly marker: InstallMarker | null;
  /** As chaves DESTE app no cofre (as do `storageKeys` do api-client). Só elas são apagadas na primeira execução. */
  readonly keysToWipe: readonly string[];
}

/** O motivo da falha sem eco de valores (o cofre guarda tokens: nada daqui pode ir parar num log com o conteúdo). */
function describeFailure(error: unknown): string {
  return error instanceof Error ? error.name : 'erro desconhecido';
}

export function createGuardedSessionStorage(options: GuardedStorageOptions): GuardedSessionStorage {
  const { vault, marker, keysToWipe } = options;
  let verification: Promise<void> | null = null;

  async function verifyInstallation(): Promise<void> {
    if (marker === null) return;

    let alreadyVerified: boolean;
    try {
      alreadyVerified = await marker.isSet();
    } catch (error) {
      throw new Error(`Não foi possível ler o marcador da instalação (${describeFailure(error)}).`);
    }
    if (alreadyVerified) return;

    // Instalação nova ou reinstalação: tudo o que o cofre tem em nome deste app é de uma instalação anterior.
    // Uma por vez e com `try` por chave (e não `Promise.allSettled`: o suporte do Hermes não está garantido): todas são
    // tentadas mesmo que uma falhe.
    const failures: string[] = [];
    for (const key of keysToWipe) {
      try {
        await vault.removeItem(key);
      } catch (error) {
        failures.push(describeFailure(error));
      }
    }
    if (failures.length > 0) {
      throw new Error(`Não foi possível limpar o cofre da instalação anterior (${failures.length} de ${keysToWipe.length}: ${failures.join(', ')}).`);
    }

    try {
      await marker.set();
    } catch (error) {
      throw new Error(`Não foi possível gravar o marcador da instalação (${describeFailure(error)}).`);
    }
  }

  function ready(): Promise<void> {
    verification ??= verifyInstallation().catch((error: unknown) => {
      verification = null; // não guarda a falha: a próxima chamada tenta de novo
      throw error;
    });
    return verification;
  }

  return {
    ready,
    getItem: async (key) => {
      await ready();
      return vault.getItem(key);
    },
    setItem: async (key, value) => {
      await ready();
      return vault.setItem(key, value);
    },
    removeItem: async (key) => {
      await ready();
      return vault.removeItem(key);
    },
  };
}
