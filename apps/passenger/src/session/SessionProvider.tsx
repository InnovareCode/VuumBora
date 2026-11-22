import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Sessão de DEMONSTRAÇÃO do passageiro (fatia A1 de docs/plano-apps-execucao.md).
 *
 * Existe só para as rotas terem uma guarda de verdade (`Stack.Protected` em `app/_layout.tsx`)
 * antes de a identidade real chegar: não autentica ninguém, não fala com a API e não guarda
 * nada em disco nem em `localStorage` — fica em memória, então recarregar a página (web) ou
 * reabrir o app derruba a sessão e volta para a P01. A2 troca isto por `SessionManager` do
 * `api-client` e A3 por armazenamento seguro; os consumidores (`useSession`) não precisam mudar
 * de forma além do `mode`.
 *
 * `mode: 'mock'` é o que faz a Home mostrar o `MockBadge` de "acesso simulado" — enquanto a
 * sessão for de mentira, a tela diz que é.
 */
export type SessionStatus = 'signedOut' | 'signedIn';

export interface SessionContextValue {
  readonly status: SessionStatus;
  readonly isSignedIn: boolean;
  readonly mode: 'mock';
  /** Abre a sessão de mentira. Não valida credencial — quem chama já passou pelo formulário. */
  signInWithMock(): void;
  signOut(): void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('signedOut');

  const signInWithMock = useCallback(() => setStatus('signedIn'), []);
  const signOut = useCallback(() => setStatus('signedOut'), []);

  const value = useMemo<SessionContextValue>(
    () => ({ status, isSignedIn: status === 'signedIn', mode: 'mock', signInWithMock, signOut }),
    [status, signInWithMock, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error('useSession precisa estar dentro de <SessionProvider> (app/_layout.tsx).');
  }
  return value;
}
