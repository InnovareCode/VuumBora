import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useApi } from './ApiContext';
import { onUnauthorized, type AdminLoginInput, type AdminUser, type DataOrigin } from '../api';

/**
 * Estado GLOBAL de propósito: "quem está logado" é lido por toda tela (barra
 * superior, guarda de rota, 401 vindo de qualquer chamada) — exatamente o
 * tipo de coisa que justifica Context em vez de estado local repetido em
 * cada página (ver responsabilidade #3 do papel).
 */
interface AuthState {
  readonly status: 'checking' | 'signedOut' | 'signedIn';
  readonly admin: AdminUser | null;
  readonly origin: DataOrigin | null;
  readonly login: (input: AdminLoginInput) => Promise<{ ok: true } | { ok: false; message: string }>;
  readonly logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const api = useApi();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [origin, setOrigin] = useState<DataOrigin | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('checking');

  useEffect(() => {
    let cancelled = false;
    api.auth.me().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setAdmin(result.data);
        setOrigin(result.origin);
        setStatus('signedIn');
      } else {
        setStatus('signedOut');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  // 401 em QUALQUER chamada (não só login) derruba a sessão na hora, em vez
  // de deixar a tela atual continuar mostrando dado de um admin "deslogado".
  useEffect(
    () =>
      onUnauthorized(() => {
        setAdmin(null);
        setOrigin(null);
        setStatus('signedOut');
      }),
    [],
  );

  const login = useCallback<AuthState['login']>(
    async (input) => {
      const result = await api.auth.login(input);
      if (!result.ok) {
        const message = result.error.kind === 'unknown' ? result.error.message : 'E-mail ou senha incorretos.';
        return { ok: false, message };
      }
      setAdmin(result.data);
      setOrigin(result.origin);
      setStatus('signedIn');
      return { ok: true };
    },
    [api],
  );

  const logout = useCallback(async () => {
    await api.auth.logout();
    setAdmin(null);
    setOrigin(null);
    setStatus('signedOut');
  }, [api]);

  return <AuthContext.Provider value={{ status, admin, origin, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() precisa de <AuthProvider> acima na árvore.');
  return ctx;
}
