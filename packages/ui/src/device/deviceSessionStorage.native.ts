/**
 * Armazenamento da sessão no iOS/Android: `expo-secure-store` (Keychain / Keystore) com a verificação de primeira
 * execução. Toda a lógica está em `nativeSessionStorage.ts` e `sessionVault.ts` (provadas por unidade); aqui só se liga o
 * módulo real. O Metro escolhe este arquivo no lugar de `deviceSessionStorage.ts` nas plataformas nativas.
 */
import { Platform, Settings } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { CreateDeviceSessionStorage } from './deviceSessionStorage.types';
import { createNativeSessionStorage } from './nativeSessionStorage';

export type { CreateDeviceSessionStorage } from './deviceSessionStorage.types';

export const createDeviceSessionStorage: CreateDeviceSessionStorage = ({ accountType }) => {
  const storage = createNativeSessionStorage({
    accountType,
    secureStore: SecureStore,
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    // `Settings` é NSUserDefaults (iOS). No Android é um stub: lá a desinstalação já apaga o cofre.
    settings: Platform.OS === 'ios' ? Settings : null,
  });
  // Começa a verificação já na criação (antes da primeira leitura). Se falhar, a falha aparece (rejeição) na primeira
  // operação do api-client, que a reporta; aqui só impede um "unhandled rejection".
  storage.ready().catch(() => undefined);
  return storage;
};
