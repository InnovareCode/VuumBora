import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useApi } from './ApiContext';
import { errorMessage, onUnauthorized, type AdminLoginInput, type AdminUser, type ApiError, type DataOrigin, type SecondFactorChallenge } from '../api';

/**
 * Estado GLOBAL de propósito: "quem está logado" é lido por toda tela (barra
 * superior, guarda de rota, 401 vindo de qualquer chamada) — exatamente o
 * tipo de coisa que justifica Context em vez de estado local repetido em
 * cada página (ver responsabilidade #3 do papel).
 */
interface AuthState {
  /**
   * `unavailable`: NÃO foi possível descobrir se há sessão (429 do limite global, rede caída, 5xx). É diferente de
   * `signedOut`: mandar a pessoa ao login por um 429 de `GET /me` parece "caiu a sessão" quando ela segue válida.
   * Só 401 (e 403/404 do próprio `/me`) significa "sem sessão".
   */
  readonly status: 'checking' | 'signedOut' | 'signedIn' | 'unavailable';
  /** Por que `status === 'unavailable'` (para a tela explicar e, no 429, contar o tempo). */
  readonly sessionProblem: ApiError | null;
  /** Refaz a checagem de sessão depois de `unavailable`. */
  readonly retrySession: () => void;
  readonly admin: AdminUser | null;
  readonly origin: DataOrigin | null;
  /**
   * `signedIn`: sessão aberta (papel sem 2FA ativo). `second_factor_required` /
   * `enrollment_required`: senha certa, mas AINDA SEM sessão — a tela de login
   * segura o `challengeToken` em memória e conduz o segundo passo.
   */
  readonly login: (
    input: AdminLoginInput,
  ) => Promise<
    | { ok: true; next: 'signedIn' }
    | ({ ok: true; next: 'second_factor_required' | 'enrollment_required' } & SecondFactorChallenge)
    | { ok: false; message: string; kind: 'credentials' | 'blocked' | 'incompatible'; lockSeconds?: number }
  >;
  /**
   * Conclui o login depois do segundo fator (a API já emitiu o cookie; aqui só a UI passa a saber). `goTo`: destino
   * pedido pela pessoa na própria tela de login (hoje só `/security`, "gerar novos códigos"). Vai JUNTO com a sessão,
   * no mesmo estado: se fosse um `navigate()` à parte, a rota `/login` já teria redirecionado para o destino padrão.
   */
  readonly acceptSession: (admin: AdminUser, origin: DataOrigin, goTo?: PostLoginDestination) => void;
  /** Para onde a rota `/login` manda quem acabou de entrar (`null` = destino padrão). */
  readonly postLoginPath: PostLoginDestination | null;
  readonly logout: () => Promise<void>;
}

/** Destinos internos que o login aceita (lista fechada: nunca um caminho vindo de fora). */
export type PostLoginDestination = '/security';

const AuthContext = createContext<AuthState | null>(null);

/** Respostas de `GET /me` que de fato significam "não há sessão". Qualquer outra falha é `unavailable`. */
const SIGNED_OUT_KINDS: ReadonlySet<ApiError['kind']> = new Set(['unauthorized', 'forbidden', 'csrf_invalid', 'not_found']);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const api = useApi();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [origin, setOrigin] = useState<DataOrigin | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('checking');
  const [sessionProblem, setSessionProblem] = useState<ApiError | null>(null);
  const [postLoginPath, setPostLoginPath] = useState<PostLoginDestination | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.auth.me().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setAdmin(result.data);
        setOrigin(result.origin);
        setSessionProblem(null);
        setStatus('signedIn');
      } else if (SIGNED_OUT_KINDS.has(result.error.kind)) {
        setSessionProblem(null);
        setStatus('signedOut');
      } else {
        // 429 do limite global, rede, 503/5xx: a sessão pode muito bem estar de pé. Não manda ao login.
        // `contract_mismatch` (resposta fora do formato) também cai aqui: NUNCA vira `signedIn`, e a tela diz o porquê.
        setSessionProblem(result.error);
        setStatus('unavailable');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [api, attempt]);

  const retrySession = useCallback(() => {
    setStatus('checking');
    setAttempt((n) => n + 1);
  }, []);

  // 401 em QUALQUER chamada (não só login) derruba a sessão na hora, em vez
  // de deixar a tela atual continuar mostrando dado de um admin "deslogado".
  useEffect(
    () =>
      onUnauthorized(() => {
        setPostLoginPath(null);
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
        // Limite de tentativas (429) e falhas de infraestrutura (rede,
        // indisponibilidade) são um estado DIFERENTE de "credenciais erradas"
        // e dizem isso na tela — mas nunca junto com detalhe sobre qual conta
        // existe. Qualquer outro erro (401 de e-mail inexistente, senha
        // errada OU usuário desativado) cai na MESMA mensagem genérica —
        // nunca revelar qual dos três aconteceu (auditoria de segurança).
        // Espera curta (1 s a 15 min) do par e-mail + IP depois de uma senha errada, com contagem — NÃO é conta
        // bloqueada. O servidor trata igual o e-mail inexistente, então a mensagem não revela se a conta existe.
        if (result.error.kind === 'account_locked') {
          return { ok: false, message: errorMessage(result.error), kind: 'blocked', lockSeconds: result.error.retryAfterSeconds };
        }
        if (result.error.kind === 'rate_limited' || result.error.kind === 'network' || result.error.kind === 'unavailable') {
          return { ok: false, message: errorMessage(result.error), kind: 'blocked' };
        }
        // Painel e API em versões diferentes: não é "senha errada" nem espera — a pessoa não tem o que corrigir.
        if (result.error.kind === 'contract_mismatch') {
          return { ok: false, message: errorMessage(result.error), kind: 'incompatible' };
        }
        const message = result.error.kind === 'unknown' ? result.error.message : 'E-mail ou senha incorretos.';
        return { ok: false, message, kind: 'credentials' };
      }
      const outcome = result.data;
      // Lista FECHADA de desfechos, cada um por nome. Nada de "se não for authenticated, é desafio": foi esse atalho
      // que fez uma API sem `status` cair no ramo do desafio, com `undefined`, e deixar a tela sem passo válido.
      // O adaptador já valida, mas esta é a última guarda antes de existir sessão na UI: o que não for um dos três
      // vira erro e NUNCA autentica (também vale para qualquer adaptador futuro, mock inclusive).
      if (outcome.status === 'second_factor_required' || outcome.status === 'enrollment_required') {
        return {
          ok: true,
          next: outcome.status,
          challengeToken: outcome.challengeToken,
          challengeExpiresAt: outcome.challengeExpiresAt,
        };
      }
      if (outcome.status === 'authenticated') {
        setPostLoginPath(null);
        setAdmin(outcome.admin);
        setOrigin(result.origin);
        setStatus('signedIn');
        return { ok: true, next: 'signedIn' };
      }
      return { ok: false, message: errorMessage({ kind: 'contract_mismatch' }), kind: 'incompatible' };
    },
    [api],
  );

  const acceptSession = useCallback<AuthState['acceptSession']>((nextAdmin, nextOrigin, goTo) => {
    setPostLoginPath(goTo ?? null);
    setAdmin(nextAdmin);
    setOrigin(nextOrigin);
    setStatus('signedIn');
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setPostLoginPath(null);
    setAdmin(null);
    setOrigin(null);
    setStatus('signedOut');
  }, [api]);

  return (
    <AuthContext.Provider value={{ status, sessionProblem, retrySession, admin, origin, login, acceptSession, postLoginPath, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() precisa de <AuthProvider> acima na árvore.');
  return ctx;
}
