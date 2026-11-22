import type { GuardedSessionStorage } from './sessionVault';
import type { DeviceAccountType } from './sessionKeys';

/**
 * Assinatura única das duas implementações de `createDeviceSessionStorage` (a do web/padrão em `deviceSessionStorage.ts`
 * e a nativa em `deviceSessionStorage.native.ts`): o TypeScript só enxerga o `.ts`, o Metro escolhe o `.native.ts` no
 * iOS/Android — as duas se declaram deste tipo para não divergirem sem o `tsc` reclamar.
 */
export type CreateDeviceSessionStorage = (options: { readonly accountType: DeviceAccountType }) => GuardedSessionStorage;
