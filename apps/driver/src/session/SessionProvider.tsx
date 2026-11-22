import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import type { SessionState } from '@vuumbora/api-client/identity';
import { identity } from '../identity/identityClient';
import { useAuthFlowStore } from '../identity/authFlowStore';

/**
 * Sessão do motorista = a sessão do cliente de identidade (`identity.session`, `@vuumbora/api-client`): quem tem o
 * token, renova (um voo só) e diz se há sessão é o cliente — este provider só a ESPELHA para a árvore de telas e
 * guarda o que é de tela (o aviso depois de sair). O app nunca decide estado de sessão (plano, princípio 1).
 *
 * Ter sessão é ter uma CONTA de motorista. Não é ter o cadastro de motorista aprovado: isso é outra etapa e nenhum
 * campo deste contexto o afirma (a Home de demonstração marca o que é de exemplo).
 *
 * `status`:
 *  - `loading`    lendo o cofre (antes do 1º estado). Com a memória é instantâneo; com o SecureStore (A3) leva um
 *                 instante — por isso o layout raiz segura a splash e NÃO monta nenhuma rota até sair daqui (senão
 *                 a tela de entrada piscaria para quem já está logado, e a guarda mandaria para o lugar errado);
 *  - `signedOut` / `signedIn`.
 *
 * `mode` é o do cliente (`mock` | `http`): enquanto for `mock` a Home mostra o selo de "acesso simulado".
 */
export type SessionStatus = 'loading' | 'signedOut' | 'signedIn';

/** Por que a pessoa está na tela de entrada de novo (aviso discreto na tela). */
export type SignedOutNotice = 'session_expired' | 'server_unconfirmed' | null;

export interface SessionContextValue {
  readonly status: SessionStatus;
  readonly isSignedIn: boolean;
  readonly mode: 'mock' | 'http';
  readonly signedOutNotice: SignedOutNotice;
  /** Sai deste aparelho (o local SEMPRE sai); resolve quando o servidor respondeu ou falhou. Nunca rejeita. */
  signOut(): Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// Funções ESTÁVEIS fora do componente: `useSyncExternalStore` reassina a cada troca de identidade da função.
const subscribe = (onChange: () => void) => identity.session.subscribe(() => onChange());
const getSnapshot = (): SessionState => identity.session.getState();

function statusOf(state: SessionState): SessionStatus {
  return state.status === 'unknown' ? 'loading' : state.status === 'signed_in' ? 'signedIn' : 'signedOut';
}

export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [serverUnconfirmed, setServerUnconfirmed] = useState(false);
  const status = statusOf(state);

  useEffect(() => {
    void identity.session.restore();
  }, []);

  // Voltar ao primeiro plano com o access token a menos de 60 s de vencer: renova ANTES da rajada de 401
  // (plano, seção 4, regra 2). O gerenciador serializa; falha transitória não desloga.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && identity.session.getState().status === 'signed_in') {
        void identity.session.refreshIfExpiring();
      }
    });
    return () => subscription.remove();
  }, []);

  // Entrou: o aviso de "saiu sem confirmar" e qualquer resto de fluxo de conta ficam para trás.
  useEffect(() => {
    if (status === 'signedIn') {
      setServerUnconfirmed(false);
      useAuthFlowStore.getState().clearAll();
    }
  }, [status]);

  const signOut = useCallback(async () => {
    try {
      const result = await identity.logout();
      setServerUnconfirmed(result.ok ? !result.data.serverRevoked : true);
    } catch {
      // `logout` não rejeita (sai local primeiro); se algo inesperado escapar, a sessão local já foi tratada.
      setServerUnconfirmed(true);
    }
  }, []);

  const signedOutNotice: SignedOutNotice =
    state.status === 'signed_out' && state.reason === 'session_expired'
      ? 'session_expired'
      : status === 'signedOut' && serverUnconfirmed
        ? 'server_unconfirmed'
        : null;

  const value = useMemo<SessionContextValue>(
    () => ({ status, isSignedIn: status === 'signedIn', mode: identity.mode, signedOutNotice, signOut }),
    [status, signedOutNotice, signOut],
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
