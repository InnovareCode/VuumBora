/**
 * Dono da sessão do app: guarda os tokens, renova o access token e é o ÚNICO ponto que fala `POST /refresh`.
 *
 * Por que renovação serializada (docs/plano-apps-execucao.md §4): a API trata o SEGUNDO uso do mesmo refresh como
 * reuso e revoga a FAMÍLIA inteira. No celular, três telas pedem dados ao voltar do segundo plano, as três recebem
 * `401`, e se as três renovassem a segunda derrubaria a sessão. Regras implementadas aqui:
 *
 *  1. UM voo: `refreshShared()` mantém uma única promessa; quem recebe 401 espera por ela e repete a chamada UMA vez.
 *  2. Quem recebe 401 só renova se o access token que ele usou AINDA é o atual. Se outra chamada já renovou, repete
 *     com o token novo sem renovar de novo (um 401 tardio não pode causar um 2º `/refresh`).
 *  3. O novo refresh é GRAVADO no armazenamento antes de liberar as chamadas em espera.
 *  4. Recusa DEFINITIVA do refresh (401 `invalid_refresh_token`, ou 400/403) = UM logout local, sem nova tentativa; as
 *     chamadas pendentes recebem `unauthorized`. Falha TRANSITÓRIA (sem rede, 5xx, 429) NÃO desloga: a sessão fica,
 *     as pendentes recebem o erro de rede, e a próxima chamada tenta renovar de novo.
 *  4b. Depois de uma falha transitória o MESMO refresh não é tentado de novo por alguns segundos: se o servidor chegou
 *     a processar a renovação e só a resposta se perdeu, repetir seria reuso (família revogada). Quem pedir nesse
 *     intervalo recebe o mesmo erro, sem rede.
 *  5. `epoch`: login e logout mudam a época. Resposta de renovação ou 401 de uma época anterior é descartada — um
 *     pedido da conta A nunca é repetido com o token da conta B, e um logout nunca é desfeito por renovação tardia.
 *
 * Limite conhecido (plano §4, item 5): se a resposta do `/refresh` se perder DEPOIS de o servidor rotacionar, o
 * cliente fica com o refresh velho e a próxima tentativa é reuso → logout forçado. O cliente não resolve sozinho.
 */
import type { ApiError, Result } from '../index';
import { failWith, NO_SESSION, succeed } from './result';
import { parseStoredSession, serializeSession, type SessionStoragePort, storageKeys } from './session-storage';
import type { AccountType, IdentityApi, SessionTokens } from './types';

export type SignOutReason = 'none' | 'user' | 'session_expired';

/** `unknown` = ainda lendo o armazenamento (antes de `restore()` terminar). */
export type SessionState =
  | { readonly status: 'unknown' }
  | { readonly status: 'signed_in' }
  | { readonly status: 'signed_out'; readonly reason: SignOutReason };

/** O que as portas de dados (corrida, oferta, WebSocket) usam. Não tem como ler nem gravar tokens soltos. */
export interface SessionManager {
  /** Instantâneo estável: o mesmo objeto enquanto nada muda (serve a `useSyncExternalStore`). */
  getState(): SessionState;
  subscribe(listener: (state: SessionState) => void): () => void;
  /** Lê a sessão do armazenamento. Idempotente; `run` e `getValidAccessToken` chamam sozinhos se faltar. */
  restore(): Promise<SessionState>;
  /**
   * Executa uma chamada autenticada. Em `401` renova (voo único) e repete UMA vez. `call` recebe o access token e
   * devolve o `Result` da porta de dados; qualquer outro erro é devolvido sem repetir.
   */
  run<T>(call: (accessToken: string) => Promise<Result<T>>): Promise<Result<T>>;
  /**
   * Access token válido por pelo menos `minValiditySeconds` (padrão 60), renovando antes se preciso. É o que o
   * WebSocket usa antes do primeiro quadro autenticado.
   */
  getValidAccessToken(minValiditySeconds?: number): Promise<Result<string>>;
  /** Para o app chamar ao voltar ao primeiro plano: renova só se o access token vence em menos de 60 s. */
  refreshIfExpiring(): Promise<Result<void>>;
}

/** O que só o `IdentityClient` usa (login e logout). */
export interface SessionController extends SessionManager {
  /** Passa a usar uma sessão nova (depois de um login). Só devolve com os tokens GRAVADOS. */
  adopt(tokens: SessionTokens): Promise<void>;
  /** Encerra: espera um refresh em voo, apaga o local e revoga no servidor (best effort). */
  signOut(): Promise<Result<{ readonly serverRevoked: boolean }>>;
  /** Apaga a sessão local (ex.: depois de `logout-all`, que já revogou tudo no servidor). */
  endLocal(reason: Exclude<SignOutReason, 'none'>): Promise<void>;
}

export interface SessionControllerOptions {
  readonly accountType: AccountType;
  readonly api: Pick<IdentityApi, 'refresh' | 'logout'>;
  readonly storage: SessionStoragePort;
  readonly origin: 'mock' | 'real';
  /** Relógio em ms (injetável nos testes). */
  readonly clock?: () => number;
  /** Chamado quando o armazenamento rejeita. Recebe só o erro: nunca logue o conteúdo da sessão. */
  readonly onStorageError?: (error: unknown) => void;
}

const DEFAULT_MIN_VALIDITY_SECONDS = 60;
/** Pausa mínima antes de repetir um refresh que falhou por motivo transitório (ver regra 4b). */
const TRANSIENT_COOLDOWN_MS = 5_000;
const MAX_COOLDOWN_MS = 60_000;

/** Recusas em que repetir não adianta: o refresh está morto (ou malformado). O resto é transitório. */
function isDefinitiveRefreshRejection(error: ApiError): boolean {
  return error.kind === 'unauthorized' || error.kind === 'validation' || error.kind === 'forbidden';
}

export function createSessionController(options: SessionControllerOptions): SessionController {
  const { api, storage, origin } = options;
  const clock = options.clock ?? Date.now;
  const sessionKey = storageKeys(options.accountType).session;

  let state: SessionState = { status: 'unknown' };
  let tokens: SessionTokens | null = null;
  let epoch = 0;
  let refreshInFlight: Promise<Result<string>> | null = null;
  let lastTransientFailure: { refreshToken: string; epoch: number; until: number; error: ApiError } | null = null;
  let restorePromise: Promise<SessionState> | null = null;
  let writeChain: Promise<void> = Promise.resolve();
  const listeners = new Set<(next: SessionState) => void>();

  function reportStorageError(error: unknown): void {
    try {
      options.onStorageError?.(error);
    } catch {
      // um observador com defeito não pode quebrar a sessão
    }
  }

  function setState(next: SessionState): void {
    const same =
      state.status === next.status &&
      (state.status !== 'signed_out' || (next.status === 'signed_out' && state.reason === next.reason));
    if (same) return;
    state = next;
    for (const listener of [...listeners]) {
      try {
        listener(next);
      } catch {
        // idem: erro de tela não derruba a renovação
      }
    }
  }

  /** Todas as escritas passam por UMA fila: a ordem de gravação é a ordem de chamada (nenhuma sobrescreve a mais nova). */
  function enqueueWrite(operation: () => Promise<void>): Promise<void> {
    const next = writeChain.then(operation).catch(reportStorageError);
    writeChain = next;
    return next;
  }

  /** Parte síncrona do logout local (memória + época + estado); devolve a promessa do apagamento no armazenamento. */
  function clearLocal(reason: Exclude<SignOutReason, 'none'>): Promise<void> {
    epoch += 1;
    tokens = null;
    setState({ status: 'signed_out', reason });
    return enqueueWrite(() => storage.removeItem(sessionKey));
  }

  function restore(): Promise<SessionState> {
    restorePromise ??= (async () => {
      let raw: string | null = null;
      try {
        raw = await storage.getItem(sessionKey);
      } catch (error) {
        reportStorageError(error);
      }
      // Um login pode ter terminado durante a leitura: o que está em memória é mais novo que o disco.
      if (state.status !== 'unknown') return state;
      const stored = parseStoredSession(raw);
      if (stored) {
        tokens = stored;
        setState({ status: 'signed_in' });
      } else {
        if (raw !== null) void enqueueWrite(() => storage.removeItem(sessionKey)); // lixo/versão estranha: limpa
        setState({ status: 'signed_out', reason: 'none' });
      }
      return state;
    })();
    return restorePromise;
  }

  async function performRefresh(startEpoch: number, refreshToken: string): Promise<Result<string>> {
    let result: Result<SessionTokens>;
    try {
      result = await api.refresh(refreshToken);
    } catch {
      result = failWith({ kind: 'network', retryable: true });
    }

    // Login/logout durante o voo: este resultado pertence a uma sessão que já não existe. Descarta.
    if (epoch !== startEpoch) return failWith(NO_SESSION);

    if (result.ok) {
      lastTransientFailure = null;
      tokens = result.data; // chamadas NOVAS já usam o token novo...
      await enqueueWrite(() => storage.setItem(sessionKey, serializeSession(result.data))); // ...e as EM ESPERA só saem depois da gravação
      return succeed(result.data.accessToken, origin);
    }

    if (isDefinitiveRefreshRejection(result.error)) {
      await clearLocal('session_expired'); // UM logout local (só existe UM voo)
      return failWith({ kind: 'unauthorized', code: result.error.code ?? 'invalid_refresh_token' });
    }
    // Transitório: a sessão fica, quem pediu recebe o erro e o mesmo refresh descansa um pouco (regra 4b).
    const waitMs = Math.min(MAX_COOLDOWN_MS, Math.max(TRANSIENT_COOLDOWN_MS, (result.error.retryAfterSeconds ?? 0) * 1000));
    lastTransientFailure = { refreshToken, epoch: startEpoch, until: clock() + waitMs, error: result.error };
    return failWith(result.error);
  }

  function refreshShared(): Promise<Result<string>> {
    if (refreshInFlight) return refreshInFlight;
    if (!tokens) return Promise.resolve(failWith(NO_SESSION));
    const cooling = lastTransientFailure;
    if (cooling && cooling.epoch === epoch && cooling.refreshToken === tokens.refreshToken && clock() < cooling.until) {
      return Promise.resolve(failWith(cooling.error));
    }
    const flight: Promise<Result<string>> = performRefresh(epoch, tokens.refreshToken).finally(() => {
      if (refreshInFlight === flight) refreshInFlight = null;
    });
    refreshInFlight = flight;
    return flight;
  }

  async function accessTokenAfterRejection(failed: { epoch: number; accessToken: string }): Promise<Result<string>> {
    if (epoch !== failed.epoch || !tokens) return failWith(NO_SESSION);
    if (tokens.accessToken !== failed.accessToken) return succeed(tokens.accessToken, origin); // outra chamada já renovou
    return refreshShared();
  }

  async function run<T>(call: (accessToken: string) => Promise<Result<T>>): Promise<Result<T>> {
    await restore();
    if (!tokens) return failWith(NO_SESSION);
    const used = { epoch, accessToken: tokens.accessToken };

    const first = await call(used.accessToken);
    if (first.ok || first.error.kind !== 'unauthorized') return first;

    const renewed = await accessTokenAfterRejection(used);
    if (!renewed.ok) return failWith(renewed.error);
    // Login/logout enquanto esperávamos a gravação do refresh: o token novo é de OUTRA sessão. Não repete.
    if (epoch !== used.epoch) return failWith(NO_SESSION);
    return call(renewed.data); // UMA repetição: um segundo 401 volta como está, sem laço
  }

  async function getValidAccessToken(minValiditySeconds = DEFAULT_MIN_VALIDITY_SECONDS): Promise<Result<string>> {
    await restore();
    if (!tokens) return failWith(NO_SESSION);
    const startEpoch = epoch;
    const expiresAtMs = Date.parse(tokens.accessTokenExpiresAt);
    const stillValid = expiresAtMs - clock() >= minValiditySeconds * 1000;
    if (stillValid) return succeed(tokens.accessToken, origin);
    const renewed = await refreshShared();
    if (!renewed.ok) return renewed; // (a recusa definitiva já mudou a época: devolve o erro de verdade, não "sem sessão")
    return epoch === startEpoch ? renewed : failWith(NO_SESSION);
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    restore,
    run,
    getValidAccessToken,
    async refreshIfExpiring() {
      const result = await getValidAccessToken();
      return result.ok ? succeed(undefined, origin) : failWith(result.error);
    },

    async adopt(next) {
      epoch += 1; // descarta renovação/401 pendentes da sessão anterior
      tokens = next;
      setState({ status: 'signed_in' });
      await enqueueWrite(() => storage.setItem(sessionKey, serializeSession(next)));
    },

    async signOut() {
      await restore();
      if (refreshInFlight) await refreshInFlight; // usa o refresh MAIS NOVO na revogação (o velho já morreu na rotação)
      const current = tokens;
      if (!current) return succeed({ serverRevoked: false }, origin);

      const cleared = clearLocal('user'); // local primeiro: a pessoa já saiu, aconteça o que acontecer na rede
      let serverRevoked = false;
      try {
        serverRevoked = (await api.logout(current.refreshToken)).ok;
      } catch {
        serverRevoked = false;
      }
      await cleared;
      return succeed({ serverRevoked }, origin);
    },

    endLocal: (reason) => clearLocal(reason),
  };
}
