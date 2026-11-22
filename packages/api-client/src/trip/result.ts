/** Construtores de `Result`/`ApiError` comuns às portas de corrida (um lugar só, como `identity/result.ts`). */
import type { ApiError, Result } from '../index';

export function succeed<T>(data: T, origin: 'mock' | 'real' = 'mock'): Result<T> {
  return { ok: true, data, origin };
}

export function failWith(error: ApiError): { readonly ok: false; readonly error: ApiError } {
  return { ok: false, error };
}

export const notFound = (): ApiError => ({ kind: 'not_found' });

export const conflict = (reason: string): ApiError => ({ kind: 'conflict', reason });

export const validation = (fields: Readonly<Record<string, string>>): ApiError => ({ kind: 'validation', fields });
