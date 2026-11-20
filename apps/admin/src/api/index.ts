import { createHttpAuthAdapter, createMockAuthAdapter, type AuthPort } from './auth';
import { createHttpDriverApplicationAdapter, createMockDriverApplicationAdapter, type DriverApplicationPort } from './driverApplications';

export type { AuthPort } from './auth';
export type { DriverApplicationPort } from './driverApplications';
export * from './types';
export * from './result';
export { onUnauthorized } from './client';

export interface Api {
  readonly mode: 'http' | 'mock';
  readonly auth: AuthPort;
  readonly driverApplications: DriverApplicationPort;
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
    return { mode, auth: createMockAuthAdapter(), driverApplications: createMockDriverApplicationAdapter() };
  }

  const baseUrl = import.meta.env.VITE_API_BASE_URL;
  if (!baseUrl) {
    throw new Error('VITE_API_MODE=http exige VITE_API_BASE_URL configurado (ver .env.example).');
  }
  return {
    mode,
    auth: createHttpAuthAdapter(baseUrl),
    driverApplications: createHttpDriverApplicationAdapter(baseUrl),
  };
}
