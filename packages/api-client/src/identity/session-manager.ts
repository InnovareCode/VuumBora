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
 *  4. Recusa DEFINITIVA do refresh = UM logout local, sem nova tentativa; as chamadas pendentes recebem
 *     `unauthorized`. Definitiva só é a recusa que o SERVIDOR DA API assinou com um `code` do contrato (401
 *     `invalid_refresh_token`; 400 `invalid_body`): STATUS sozinho não basta, porque um proxy, WAF ou CDN também
 *     responde 401/403/400 e isso não pode derrubar a sessão de todo mundo (M-4). Falha TRANSITÓRIA (sem rede, 5xx,
 *     429 e qualquer recusa sem `code` reconhecido) NÃO desloga: a sessão fica e a próxima chamada tenta renovar.
 *  4b. Depois de uma falha transitória o MESMO refresh não é tentado de novo por alguns segundos: se o servidor chegou
 *     a processar a renovação e só a resposta se perdeu, repetir seria reuso (família revogada). Quem pedir nesse
 *     intervalo recebe o mesmo erro, sem rede.
 *  5. `epoch`: login e logout mudam a época. O resultado de qualquer chamada (sucesso ou erro) e de qualquer renovação
 *     de uma época anterior é descartado — nada da conta A chega à tela da conta B, um pedido da conta A nunca é
 *     repetido com o token da B, e um logout nunca é desfeito por renovação tardia.
 *  6. Sessão que sai do aparelho sem o servidor confirmar (logout sem rede; login por cima de uma sessão aberta) é
 *     revogada em segundo plano e, se a revogação falhar por rede/servidor, GUARDADA numa fila e repetida na abertura
 *     (`restore`). A API revoga a FAMÍLIA inteira por qualquer refresh dela, então o mais novo que conhecemos serve.
 *
 * Limite conhecido (plano §4, item 5): se a resposta do `/refresh` se perder DEPOIS de o servidor rotacionar, o
 * cliente fica com o refresh velho e a próxima tentativa é reuso → logout forçado. O cliente não resolve sozinho
 * (o descanso da regra 4b não evita: repetir depois dele ainda é reuso; só uma tolerância no servidor evitaria).
 */
import type { ApiError, Result } from '../index';
import { NETWORK_ERROR } from './errors';
import { failWith, NO_SESSION, succeed } from './result';
import {
  MAX_PENDING_REVOCATIONS,
  parsePendingRevocations,
  parseStoredSession,
  type PendingRevocation,
  serializePendingRevocations,
  serializeSession,
  type SessionStoragePort,
  storageKeys,
} from './session-storage';
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
  /**
   * Lê a sessão do armazenamento e, em segundo plano, repete as revogações que ficaram pendentes. Idempotente;
   * `run` e `getValidAccessToken` chamam sozinhos se faltar.
   */
  restore(): Promise<SessionState>;
  /**
   * Executa uma chamada autenticada. Em `401` renova (voo único) e repete UMA vez. `call` recebe o access token e
   * devolve o `Result` da porta de dados; qualquer outro erro é devolvido sem repetir. Se a sessão mudar (logout,
   * troca de conta) enquanto a chamada está no ar, o resultado é descartado: `unauthorized` com `code: 'no_session'`.
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
  /**
   * Passa a usar uma sessão nova (depois de um login). Só devolve com os tokens GRAVADOS. Se havia outra sessão
   * aberta, ela é revogada no servidor em segundo plano (sem esperar: o login não depende disso).
   */
  adopt(tokens: SessionTokens): Promise<void>;
  /** Encerra: espera um refresh em voo, apaga o local e revoga no servidor (best effort, com fila se falhar). */
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

/**
 * Os `code`s com que a API recusa um refresh para sempre, e em quais STATUS (`kind`) ela os emite. `invalid_refresh_token`
 * é o `401` do contrato (qualquer recusa); `invalid_body` é o `400` de um refresh malformado guardado. `validation` e
 * `forbidden` aceitam `invalid_refresh_token` por tolerância: o `code` é a assinatura do servidor, o status é só o
 * transporte. Código que não está aqui — ou nenhum — NÃO é prova de que o refresh morreu.
 * (`Map`, não objeto: o `code` vem do fio e `constructor`/`__proto__` casam com o padrão de código.)
 */
const DEFINITIVE_REFRESH_CODES: ReadonlyMap<string, ReadonlySet<ApiError['kind']>> = new Map([
  ['invalid_refresh_token', new Set<ApiError['kind']>(['unauthorized', 'validation', 'forbidden'])],
  ['invalid_body', new Set<ApiError['kind']>(['validation'])],
]);

function isDefinitiveRefreshRejection(error: ApiError): error is ApiError & { readonly code: string } {
  return error.code !== undefined && DEFINITIVE_REFRESH_CODES.get(error.code)?.has(error.kind) === true;
}

/**
 * O que quem pediu recebe quando a renovação falhou SEM ser definitiva. Uma recusa sem `code` reconhecido (401/403/400
 * de intermediário) NÃO pode chegar à tela como `unauthorized`/`forbidden`/`validation`: a sessão continua aberta, e a
 * tela leria "sessão acabou" ou "sem permissão". Vira `unavailable` (tente de novo), sem inventar `code`.
 */
function transientRefreshError(error: ApiError): ApiError {
  switch (error.kind) {
    case 'unauthorized':
    case 'forbidden':
    case 'validation':
    case 'not_found':
    case 'conflict':
      return { kind: 'unavailable', retryable: true, ...(error.retryAfterSeconds !== undefined ? { retryAfterSeconds: error.retryAfterSeconds } : {}) };
    default:
      return error;
  }
}

/** Falha de revogação que vale repetir depois (o servidor pode nem ter visto o pedido). O resto (400...) não melhora. */
function isRetryableRevocationFailure(error: ApiError): boolean {
  return error.kind === 'network' || error.kind === 'unavailable' || error.kind === 'rate_limited' || error.kind === 'unknown';
}

export function createSessionController(options: SessionControllerOptions): SessionController {
  const { api, storage, origin } = options;
  const clock = options.clock ?? Date.now;
  const keys = storageKeys(options.accountType);
  const sessionKey = keys.session;

  let state: SessionState = { status: 'unknown' };
  let tokens: SessionTokens | null = null;
  let epoch = 0;
  let refreshInFlight: Promise<Result<string>> | null = null;
  let lastTransientFailure: { refreshToken: string; epoch: number; until: number; error: ApiError } | null = null;
  let restorePromise: Promise<SessionState> | null = null;
  let flushPromise: Promise<void> | null = null;
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

  // ---- revogação no servidor de sessão que saiu do aparelho (regra 6) ----

  async function revokeOnServer(refreshToken: string): Promise<Result<void>> {
    try {
      return await api.logout(refreshToken);
    } catch {
      return failWith(NETWORK_ERROR);
    }
  }

  /** Leitura-modificação-gravação da fila, DENTRO da fila de escritas (duas alterações nunca se pisam). */
  function updatePendingRevocations(mutate: (items: PendingRevocation[]) => PendingRevocation[]): Promise<void> {
    return enqueueWrite(async () => {
      const next = mutate(parsePendingRevocations(await storage.getItem(keys.pendingRevocations)));
      if (next.length === 0) await storage.removeItem(keys.pendingRevocations);
      else await storage.setItem(keys.pendingRevocations, serializePendingRevocations(next));
    });
  }

  function queueRevocation(session: SessionTokens): Promise<void> {
    const item: PendingRevocation = { refreshToken: session.refreshToken, expiresAt: session.refreshTokenExpiresAt };
    return updatePendingRevocations((items) =>
      [...items.filter((other) => other.refreshToken !== item.refreshToken && Date.parse(other.expiresAt) > clock()), item].slice(
        -MAX_PENDING_REVOCATIONS,
      ),
    );
  }

  /** Revoga e, se o servidor não pôde ouvir agora, guarda para a próxima abertura. Nunca rejeita. */
  async function revokeOrQueue(session: SessionTokens): Promise<boolean> {
    const result = await revokeOnServer(session.refreshToken);
    if (!result.ok && isRetryableRevocationFailure(result.error)) await queueRevocation(session);
    return result.ok;
  }

  /** Repete, uma a uma, as revogações guardadas. Para na primeira falha de rede (as outras falhariam igual). */
  function flushPendingRevocations(): Promise<void> {
    flushPromise ??= (async () => {
      let items: PendingRevocation[];
      try {
        items = parsePendingRevocations(await storage.getItem(keys.pendingRevocations));
      } catch (error) {
        reportStorageError(error);
        return;
      }
      const settled = new Set<string>();
      for (const item of items) {
        if (Date.parse(item.expiresAt) <= clock()) {
          settled.add(item.refreshToken); // venceu: o servidor já não o aceita, não há o que revogar
          continue;
        }
        const result = await revokeOnServer(item.refreshToken);
        if (result.ok || !isRetryableRevocationFailure(result.error)) settled.add(item.refreshToken);
        else break;
      }
      if (settled.size > 0) await updatePendingRevocations((current) => current.filter((item) => !settled.has(item.refreshToken)));
    })().finally(() => {
      flushPromise = null;
    });
    return flushPromise;
  }

  function restore(): Promise<SessionState> {
    restorePromise ??= (async () => {
      let raw: string | null = null;
      let readFailed = false;
      try {
        raw = await storage.getItem(sessionKey);
      } catch (error) {
        readFailed = true;
        reportStorageError(error);
      }
      // Um login pode ter terminado durante a leitura: o que está em memória é mais novo que o disco.
      if (state.status === 'unknown') {
        const stored = parseStoredSession(raw);
        if (stored) {
          tokens = stored;
          setState({ status: 'signed_in' });
        } else {
          if (raw !== null) void enqueueWrite(() => storage.removeItem(sessionKey)); // lixo/versão estranha: limpa
          setState({ status: 'signed_out', reason: 'none' });
        }
      }
      // Cofre que nem lê a sessão não vai ler a fila: tenta de novo na próxima abertura, sem reportar duas vezes.
      if (!readFailed) void flushPendingRevocations();
      return state;
    })();
    return restorePromise;
  }

  async function performRefresh(startEpoch: number, refreshToken: string): Promise<Result<string>> {
    let result: Result<SessionTokens>;
    try {
      result = await api.refresh(refreshToken);
    } catch {
      result = failWith(NETWORK_ERROR);
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
      return failWith({ kind: 'unauthorized', code: result.error.code }); // o `code` é o do servidor, nunca inventado
    }
    // Transitório (inclui recusa sem `code` reconhecido): a sessão fica, quem pediu recebe o erro e o mesmo refresh
    // descansa um pouco (regra 4b).
    const error = transientRefreshError(result.error);
    const waitMs = Math.min(MAX_COOLDOWN_MS, Math.max(TRANSIENT_COOLDOWN_MS, (error.retryAfterSeconds ?? 0) * 1000));
    lastTransientFailure = { refreshToken, epoch: startEpoch, until: clock() + waitMs, error };
    return failWith(error);
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
    // Login/logout enquanto a chamada estava no ar: a resposta é de uma sessão que já não existe (da conta A, talvez,
    // e quem espera agora é a B). Descarta o resultado inteiro, sucesso ou erro.
    if (epoch !== used.epoch) return failWith(NO_SESSION);
    if (first.ok || first.error.kind !== 'unauthorized') return first;

    const renewed = await accessTokenAfterRejection(used);
    if (!renewed.ok) return failWith(renewed.error);
    // Login/logout enquanto esperávamos a gravação do refresh: o token novo é de OUTRA sessão. Não repete.
    if (epoch !== used.epoch) return failWith(NO_SESSION);
    const second = await call(renewed.data); // UMA repetição: um segundo 401 volta como está, sem laço
    return epoch === used.epoch ? second : failWith(NO_SESSION);
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
      const previous = tokens; // a sessão que este login substitui (o refresh mais novo que conhecemos)
      epoch += 1; // descarta renovação/401 pendentes da sessão anterior
      tokens = next;
      setState({ status: 'signed_in' });
      const written = enqueueWrite(() => storage.setItem(sessionKey, serializeSession(next)));
      // Sessão aberta por baixo do login: sem isto ela ficaria viva no servidor até vencer (sessão órfã). Nunca
      // revoga a que acabou de ser adotada, e não faz o login esperar pela rede.
      if (previous && previous.refreshToken !== next.refreshToken) void revokeOrQueue(previous);
      await written;
    },

    async signOut() {
      await restore();
      if (refreshInFlight) await refreshInFlight; // usa o refresh MAIS NOVO na revogação (o velho já morreu na rotação)
      const current = tokens;
      if (!current) return succeed({ serverRevoked: false }, origin);

      const cleared = clearLocal('user'); // local primeiro: a pessoa já saiu, aconteça o que acontecer na rede
      const serverRevoked = await revokeOrQueue(current); // sem rede: fica na fila e é repetido na próxima abertura
      await cleared;
      return succeed({ serverRevoked }, origin);
    },

    endLocal: (reason) => clearLocal(reason),
  };
}
