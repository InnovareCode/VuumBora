/**
 * Cofre NATIVO da sessão (iOS/Android) sobre `expo-secure-store`, com as dependências injetadas — este arquivo não
 * importa módulo nativo nenhum, então roda sob `node --import tsx` com um SecureStore falso (`test/`). A ligação com o
 * módulo real está em `deviceSessionStorage.native.ts` (10 linhas).
 *
 * Acessibilidade do Keychain (`keychainAccessible`): `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, decisão a confirmar com a Órion.
 *  - `THIS_DEVICE_ONLY`: o item NÃO migra em backup/restauração para outro aparelho (o padrão `WHEN_UNLOCKED` migra com
 *    backup criptografado: o refresh token viraria uma cópia de sessão em outro aparelho);
 *  - `AFTER_FIRST_UNLOCK` (e não `WHEN_UNLOCKED`): o app do motorista vai precisar do token com a tela bloqueada
 *    (localização em segundo plano, push). Um app aberto em segundo plano com o aparelho travado, lendo um item
 *    `WHEN_UNLOCKED`, receberia erro e o `SessionManager` daquele processo ficaria deslogado até o app ser reaberto.
 *  Trocar depois só vale para itens regravados (o iOS mantém a acessibilidade com que o item foi criado).
 *
 * Marcador de primeira execução (só iOS, ver `sessionVault.ts`): `NSUserDefaults` via `Settings` do React Native, que o
 * núcleo do RN já traz (nenhuma dependência nova) e que é apagado na desinstalação. No Android `settings` é `null`: o
 * `Settings` de lá é um stub que só avisa, e lá a desinstalação já apaga o cofre.
 */
import {
  createGuardedSessionStorage,
  type GuardedSessionStorage,
  type InstallMarker,
  type KeyValueStorage,
} from './sessionVault';
import { deviceSessionKeys, installMarkerKey, type DeviceAccountType } from './sessionKeys';

/** Só o que usamos do `expo-secure-store` (o módulo inteiro serve: métodos em forma de método, parâmetros opcionais). */
export interface SecureStoreLike {
  getItemAsync(key: string, options?: { keychainAccessible?: number }): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: { keychainAccessible?: number }): Promise<void>;
  deleteItemAsync(key: string, options?: { keychainAccessible?: number }): Promise<void>;
}

/** Só o que usamos do `Settings` do React Native (`NSUserDefaults`, iOS). */
export interface SettingsLike {
  get(key: string): unknown;
  set(values: Record<string, unknown>): void;
}

export interface NativeSessionStorageOptions {
  readonly accountType: DeviceAccountType;
  readonly secureStore: SecureStoreLike;
  /** `SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` (o valor é uma constante nativa, por isso entra por aqui). */
  readonly keychainAccessible: number;
  /** `NSUserDefaults` no iOS; `null` onde a desinstalação já apaga o cofre (Android). */
  readonly settings: SettingsLike | null;
}

const MARKER_VALUE = '1';

function createSettingsMarker(settings: SettingsLike, key: string): InstallMarker {
  return {
    isSet: async () => settings.get(key) === MARKER_VALUE,
    set: async () => {
      settings.set({ [key]: MARKER_VALUE });
    },
  };
}

export function createNativeSessionStorage(options: NativeSessionStorageOptions): GuardedSessionStorage {
  const { accountType, secureStore, keychainAccessible, settings } = options;

  const vault: KeyValueStorage = {
    getItem: (key) => secureStore.getItemAsync(key),
    setItem: (key, value) => secureStore.setItemAsync(key, value, { keychainAccessible }),
    removeItem: (key) => secureStore.deleteItemAsync(key),
  };

  return createGuardedSessionStorage({
    vault,
    marker: settings === null ? null : createSettingsMarker(settings, installMarkerKey(accountType)),
    keysToWipe: deviceSessionKeys(accountType),
  });
}
