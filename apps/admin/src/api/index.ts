import { createHttpAuthAdapter, createMockAuthAdapter, type AuthPort } from './auth';
import { createHttpTwoFactorAdapter, createMockTwoFactorAdapter, type TwoFactorPort } from './twoFactor';
import { createHttpEmailSettingsAdapter, createMockEmailSettingsAdapter, type EmailSettingsPort } from './emailSettings';
import { createHttpDriverApplicationAdapter, createMockDriverApplicationAdapter, type DriverApplicationPort } from './driverApplications';
import { createHttpAdminUserAdapter, createMockAdminUserAdapter, type AdminUserPort } from './adminUsers';

export type { AuthPort } from './auth';
export type { TwoFactorPort } from './twoFactor';
export type { EmailSettingsPort } from './emailSettings';
export type { DriverApplicationPort } from './driverApplications';
export type { AdminUserPort } from './adminUsers';
export * from './types';
export * from './result';
export { onUnauthorized } from './client';

export interface Api {
  readonly mode: 'http' | 'mock';
  readonly auth: AuthPort;
  readonly twoFactor: TwoFactorPort;
  readonly emailSettings: EmailSettingsPort;
  readonly driverApplications: DriverApplicationPort;
  readonly adminUsers: AdminUserPort;
}

/**
 * Escolha de adaptador é EXPLÍCITA via `VITE_API_MODE`, nunca um fallback
 * automático quando a chamada real falha — isso seria mock silencioso (regra
 * do briefing). Padrão "mock" porque, nesta entrega, `/v1/admin/*` ainda não
 * existe no ar (Vega implementa em paralelo — ver docs/plano-sistema.md fase S2).
 */
export function createApi(): Api {
  const mode = import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock';

  if (mode === 'mock') {
    return {
      mode,
      auth: createMockAuthAdapter(),
      twoFactor: createMockTwoFactorAdapter(),
      emailSettings: createMockEmailSettingsAdapter(),
      driverApplications: createMockDriverApplicationAdapter(),
      adminUsers: createMockAdminUserAdapter(),
    };
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL;
  if (!baseUrl) {
    throw new Error('VITE_API_MODE=http exige VITE_API_BASE_URL configurado (ver .env.example).');
  }
  return {
    mode,
    auth: createHttpAuthAdapter(baseUrl),
    twoFactor: createHttpTwoFactorAdapter(baseUrl),
    emailSettings: createHttpEmailSettingsAdapter(baseUrl),
    driverApplications: createHttpDriverApplicationAdapter(baseUrl),
    adminUsers: createHttpAdminUserAdapter(baseUrl),
  };
}
