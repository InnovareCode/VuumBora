/** Construtores de `Result` da identidade (um lugar só, para a origem nunca ser esquecida). */
import type { ApiError, Result } from '../index';

export function succeed<T>(data: T, origin: 'mock' | 'real'): Result<T> {
  return { ok: true, data, origin };
}

export function failWith(error: ApiError): { readonly ok: false; readonly error: ApiError } {
  return { ok: false, error };
}

/** Sem sessão local (nunca entrou, já saiu, ou a sessão mudou no meio da chamada). */
export const NO_SESSION: ApiError = { kind: 'unauthorized', code: 'no_session' };
