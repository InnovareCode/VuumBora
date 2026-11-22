/**
 * Teto GLOBAL de concorrência do bcrypt, fora da thread principal (revisão S1 rodada 3, A-1; rodada 3b, M-1, B-1, B-4).
 *
 * O problema: o bcryptjs é JS puro. Uma comparação de custo 12 gasta ~480 ms de CPU e, na thread principal,
 * ocupa o laço de eventos; poucas dezenas de requisições (de IPs diferentes, cada um dentro do seu limite)
 * deixavam o `/healthz` e o login do admin segundos sem resposta, e o health check podia reiniciar a API.
 *
 * O desenho:
 *  - o bcrypt roda em THREADS de trabalho (`bcrypt-worker.ts`): o laço principal nunca é ocupado por ele;
 *  - cada pista (lane) tem um número FIXO de threads (= quantas operações rodam ao mesmo tempo) e uma fila de
 *    espera LIMITADA; além da fila, a chamada falha NA HORA com `BcryptBusyError` (a rota responde 503 +
 *    Retry-After), em vez de empilhar trabalho sem fim. A espera máxima é `fila / threads × custo`;
 *  - DUAS pistas independentes: `app` (cadastro, login, verificação e redefinição dos apps — a pista que o
 *    público alcança) e `admin` (login e reautenticação do painel). Uma rajada contra os apps não toma a vaga do
 *    admin: o login do dono segue com a vaga dele;
 *  - JUSTIÇA POR ORIGEM (M-1): cada chamada declara de que balde de IP veio (`origin`, o /48 no IPv6) e um balde segura
 *    no máximo `maxPerOrigin` (2) lugares DE ESPERA (reservados + na fila) de uma vez; o que já está rodando não conta.
 *    Sem isto a fila é FIFO pura e quem manda mais rápido ocupa a fila inteira: medido, o titular legítimo perdia de
 *    16% a 60% das tentativas enquanto um único balde atacava;
 *  - RESERVA ANTES DO BANCO (B-1): `reserve(origin)` toma o lugar ANTES de a rota gravar qualquer contador (tentativa
 *    do par, espera progressiva, teto de e-mails) e o uso posterior (`hash`/`compare`) nunca é recusado por falta de
 *    lugar. Assim uma recusa por pista cheia acontece antes de qualquer gravação, e não há o que desfazer (o papel de
 *    runtime da API NÃO tem DELETE em `login_attempts`: migração 0017, o contador só se acrescenta). O lugar reservado e
 *    não usado volta por `release()` (as rotas o chamam num `finally`, ver `withBcryptReservation`);
 *  - VIGIA POR OPERAÇÃO (B-4): uma operação que passa de `jobTimeoutMs` mata a thread (que o `lose` repõe) e falha com
 *    `BcryptWorkerError('Timeout')`; o `close` espera as operações em curso só até `closeGraceMs`;
 *  - o teto vale por PROCESSO (cada réplica tem o seu).
 *
 * Por que threads com o bcryptjs, e não o `bcrypt` nativo nem o argon2: o algoritmo e o formato do hash ficam
 * IDÊNTICOS (mesma biblioteca; todo hash já gravado, de contas e de admins, continua válido sem migração nem
 * recálculo), não entra dependência nova (nada de binário nativo na imagem Alpine, nada de mexer no
 * package-lock), e o custo medido é parecido (478 ms contra 406 ms por comparação no nativo, nesta máquina).
 * O ganho real vem de tirar o bcrypt da thread principal e de limitar a concorrência, e as threads fazem os dois.
 *
 * Nunca logar a senha nem o hash: nada daqui os registra, e os erros do worker voltam sem mensagem. A chave de origem
 * vive só na memória (o HMAC do balde, nunca o IP em claro) e não vai para log.
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { z } from 'zod';
import type { BcryptRequest, BcryptResponse } from './bcrypt-worker.js';

/**
 * Por que a pista recusou (revisão S1 rodada 3c, B-8): `origin` = o balde de origem já segura o máximo de lugares de espera;
 * `capacity` = sem vaga e sem lugar na fila (pista cheia); `closing` = pista em desligamento. É só para o LOG e o diagnóstico: nunca vai
 * ao cliente nem carrega a chave de origem (o HMAC do balde).
 */
export type BcryptBusyReason = 'origin' | 'capacity' | 'closing';

/** Sem vaga e sem lugar na fila, balde de origem no limite, ou pista em desligamento: a rota traduz em 503 + `Retry-After`. */
export class BcryptBusyError extends Error {
  readonly code = 'BCRYPT_BUSY';
  constructor(readonly lane: string, readonly reason: BcryptBusyReason) {
    super('bcrypt_busy');
    this.name = 'BcryptBusyError';
  }
}

/** A thread caiu, estourou o prazo ou devolveu erro no meio de uma operação. Sem detalhe: a mensagem poderia carregar dado de senha. */
export class BcryptWorkerError extends Error {
  readonly code = 'BCRYPT_WORKER_FAILED';
  constructor(readonly reason: string) {
    super('bcrypt_worker_failed');
    this.name = 'BcryptWorkerError';
  }
}

/** Segundos sugeridos ao cliente quando a pista está cheia (a fila esvazia em poucos segundos). */
export const BCRYPT_BUSY_RETRY_AFTER_SECONDS = 3;

/** Lugares de ESPERA da pista (reservados + na fila; o que já roda não conta) que UM balde de IP segura ao mesmo tempo. Quem precisa de mais recebe o 503. */
export const DEFAULT_MAX_PER_ORIGIN = 2;
/** Prazo de UMA operação rodando: custo 15 (o máximo aceito) leva ~4 s num núcleo comum; 20 s cobre um núcleo lento e ainda recupera a vaga. */
export const DEFAULT_JOB_TIMEOUT_MS = 20_000;
/** Quanto o `close` espera as operações em curso antes de terminar as threads à força. Abaixo do que um orquestrador concede ao SIGTERM. */
export const DEFAULT_CLOSE_GRACE_MS = 10_000;

// Em produção o worker é o `.js` compilado ao lado deste arquivo; sob o `tsx` (testes, `npm run dev`) é o `.ts`
// (as threads herdam o `--import tsx` do processo).
const WORKER_URL = new URL(import.meta.url.endsWith('.ts') ? './bcrypt-worker.ts' : './bcrypt-worker.js', import.meta.url);

interface Job {
  readonly request: BcryptRequest;
  /** Balde de origem que segura este lugar de espera (devolvido quando a operação começa a rodar ou é recusada). `null` = sem balde (uso interno). */
  readonly origin: string | null;
  readonly resolve: (value: string | boolean) => void;
  readonly reject: (err: Error) => void;
}

interface Slot {
  readonly worker: Worker;
  job: Job | null;
  /** Vigia do prazo da operação em curso. */
  timer: NodeJS.Timeout | null;
}

export interface BcryptPoolStats {
  /** Threads criadas até agora (nascem sob demanda, até `size`). */
  readonly workers: number;
  readonly active: number;
  readonly waiting: number;
  /** Lugares reservados por `reserve()` que ainda não viraram operação nem foram devolvidos. */
  readonly reserved: number;
  readonly peakActive: number;
  readonly peakWaiting: number;
  /** Chamadas recusadas por falta de vaga e de fila, ou por o balde de origem estar no limite. */
  readonly rejected: number;
  /** Das recusadas, quantas foram só por o balde de origem já segurar `maxPerOrigin` lugares (a pista tinha lugar). */
  readonly rejectedByOrigin: number;
  readonly completed: number;
  /** Operações mortas pelo vigia de prazo. */
  readonly timedOut: number;
}

/**
 * Um lugar da pista já garantido. Quem o tem NÃO é mais recusado por pista cheia: `hash`/`compare` entram direto
 * (rodam já ou esperam na fila, que tem lugar para eles). Use UMA vez; lugar não usado volta com `release()` (idempotente).
 */
export interface BcryptReservation {
  hash(password: string, cost: number): Promise<string>;
  compare(password: string, hash: string): Promise<boolean>;
  release(): void;
}

export interface BcryptPoolOptions {
  /** Lugares de espera (reservados + na fila) que um balde de origem segura ao mesmo tempo (padrão `DEFAULT_MAX_PER_ORIGIN`). */
  readonly maxPerOrigin?: number;
  /** Prazo de uma operação rodando (padrão `DEFAULT_JOB_TIMEOUT_MS`). */
  readonly jobTimeoutMs?: number;
  /** Espera máxima do `close` pelas operações em curso (padrão `DEFAULT_CLOSE_GRACE_MS`). */
  readonly closeGraceMs?: number;
  /** Só os testes: outra thread de trabalho (uma que trava, por exemplo). */
  readonly workerUrl?: URL;
}

export class BcryptPool {
  private readonly slots = new Set<Slot>();
  private readonly waiting: Job[] = [];
  private readonly idleWaiters: Array<() => void> = [];
  /** Lugares de espera por balde de origem (reservados + na fila). Sai da conta quando a operação começa a rodar. A entrada some em zero. */
  private readonly byOrigin = new Map<string, number>();
  readonly maxPerOrigin: number;
  /** Prazo de uma operação rodando. Lido a cada entrega: pode ser ajustado em tempo de execução (os testes aquecem as threads com prazo folgado e só então o encurtam). */
  jobTimeoutMs: number;
  readonly closeGraceMs: number;
  private readonly workerUrl: URL;
  private closing = false;
  private active = 0;
  private pending = 0;
  private peakActive = 0;
  private peakWaiting = 0;
  private rejected = 0;
  private rejectedByOrigin = 0;
  private completed = 0;
  private timedOut = 0;

  constructor(
    readonly lane: string,
    /** Operações simultâneas (= threads). O teto de concorrência da pista. */
    readonly size: number,
    /** Quantas esperam por vaga; a seguinte é recusada. */
    readonly maxQueue: number,
    options: BcryptPoolOptions = {},
  ) {
    if (!Number.isInteger(size) || size < 1) throw new RangeError('bcrypt pool: size >= 1');
    if (!Number.isInteger(maxQueue) || maxQueue < 0) throw new RangeError('bcrypt pool: maxQueue >= 0');
    this.maxPerOrigin = options.maxPerOrigin ?? DEFAULT_MAX_PER_ORIGIN;
    this.jobTimeoutMs = options.jobTimeoutMs ?? DEFAULT_JOB_TIMEOUT_MS;
    this.closeGraceMs = options.closeGraceMs ?? DEFAULT_CLOSE_GRACE_MS;
    this.workerUrl = options.workerUrl ?? WORKER_URL;
    if (!Number.isInteger(this.maxPerOrigin) || this.maxPerOrigin < 1) throw new RangeError('bcrypt pool: maxPerOrigin >= 1');
    if (!Number.isFinite(this.jobTimeoutMs) || this.jobTimeoutMs < 1) throw new RangeError('bcrypt pool: jobTimeoutMs >= 1');
    if (!Number.isFinite(this.closeGraceMs) || this.closeGraceMs < 0) throw new RangeError('bcrypt pool: closeGraceMs >= 0');
  }

  /**
   * Toma um lugar na pista ANTES de qualquer gravação no banco (B-1). Lança `BcryptBusyError` na hora se a pista está
   * cheia, se `origin` já segura `maxPerOrigin` lugares de espera (M-1) ou se a pista está fechando.
   */
  reserve(origin: string | null = null): BcryptReservation {
    this.takePlace(origin);
    let held = true;
    const spend = (request: BcryptRequest): Promise<string | boolean> => {
      if (!held) return Promise.reject(new Error('bcrypt_reservation_already_used'));
      held = false;
      this.pending -= 1;
      return this.enqueue(request, origin);
    };
    return {
      hash: (password, cost) => spend({ op: 'hash', password, cost }) as Promise<string>,
      compare: (password, hash) => spend({ op: 'compare', password, hash }) as Promise<boolean>,
      release: () => {
        if (!held) return;
        held = false;
        this.pending -= 1;
        this.dropOrigin(origin);
      },
    };
  }

  /** Reserva e usa de uma vez. A recusa volta como promessa rejeitada (nunca como exceção síncrona). */
  hash(password: string, cost: number, origin: string | null = null): Promise<string> {
    try {
      return this.reserve(origin).hash(password, cost);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  compare(password: string, hash: string, origin: string | null = null): Promise<boolean> {
    try {
      return this.reserve(origin).compare(password, hash);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /** Verdadeiro quando QUALQUER reserva nova seria recusada agora por falta de lugar (não olha o balde de origem). */
  get saturated(): boolean {
    return this.closing || this.inFlight >= this.size + this.maxQueue;
  }

  stats(): BcryptPoolStats {
    return {
      workers: this.slots.size,
      active: this.active,
      waiting: this.waiting.length,
      reserved: this.pending,
      peakActive: this.peakActive,
      peakWaiting: this.peakWaiting,
      rejected: this.rejected,
      rejectedByOrigin: this.rejectedByOrigin,
      completed: this.completed,
      timedOut: this.timedOut,
    };
  }

  /**
   * Recusa a fila, espera as operações em curso ATÉ `graceMs` (B-4: uma thread travada não pode segurar o desligamento)
   * e encerra as threads; o que ainda rodava no prazo falha com `BcryptWorkerError('PoolClosed')`. Uma pista fechada recusa tudo.
   */
  async close(graceMs: number = this.closeGraceMs): Promise<void> {
    this.closing = true;
    for (const job of this.waiting.splice(0)) {
      this.dropOrigin(job.origin);
      job.reject(new BcryptBusyError(this.lane, 'closing'));
    }
    if (this.active > 0) {
      let timer: NodeJS.Timeout | undefined;
      const idle = new Promise<void>((resolve) => this.idleWaiters.push(resolve));
      const expired = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, graceMs);
      });
      await Promise.race([idle, expired]);
      clearTimeout(timer);
    }
    const slots = [...this.slots];
    for (const slot of slots) this.lose(slot, null, 'PoolClosed');
    await Promise.all(slots.map((slot) => slot.worker.terminate().catch(() => undefined)));
  }

  /** Lugares ocupados agora: operações rodando + esperando + reservadas que ainda não foram usadas. */
  private get inFlight(): number {
    return this.active + this.waiting.length + this.pending;
  }

  private takePlace(origin: string | null): void {
    if (this.closing) throw new BcryptBusyError(this.lane, 'closing');
    if (origin !== null && (this.byOrigin.get(origin) ?? 0) >= this.maxPerOrigin) {
      this.rejected += 1;
      this.rejectedByOrigin += 1;
      throw new BcryptBusyError(this.lane, 'origin');
    }
    if (this.inFlight >= this.size + this.maxQueue) {
      this.rejected += 1;
      throw new BcryptBusyError(this.lane, 'capacity');
    }
    this.pending += 1;
    if (origin !== null) this.byOrigin.set(origin, (this.byOrigin.get(origin) ?? 0) + 1);
  }

  private dropOrigin(origin: string | null): void {
    if (origin === null) return;
    const left = (this.byOrigin.get(origin) ?? 1) - 1;
    if (left > 0) this.byOrigin.set(origin, left);
    else this.byOrigin.delete(origin);
  }

  /** Transforma um lugar já tomado em operação: roda numa thread livre ou espera na fila (que tem lugar garantido por `takePlace`). */
  private enqueue(request: BcryptRequest, origin: string | null): Promise<string | boolean> {
    return new Promise((resolve, reject) => {
      if (this.closing) {
        this.dropOrigin(origin);
        reject(new BcryptBusyError(this.lane, 'closing'));
        return;
      }
      const job: Job = { request, origin, resolve, reject };
      const slot = this.idleSlot();
      if (slot) {
        this.dispatch(slot, job);
        return;
      }
      // Pelo desenho (rodando + esperando + reservados <= vagas + fila) isto não acontece; fica como cinto e suspensório.
      if (this.waiting.length >= this.maxQueue) {
        this.rejected += 1;
        this.dropOrigin(origin);
        reject(new BcryptBusyError(this.lane, 'capacity'));
        return;
      }
      this.waiting.push(job);
      this.peakWaiting = Math.max(this.peakWaiting, this.waiting.length);
    });
  }

  /** Uma thread livre; se todas estão ocupadas e ainda cabe outra, cria. `null` = a pista está cheia. */
  private idleSlot(): Slot | null {
    for (const slot of this.slots) if (slot.job === null) return slot;
    return this.slots.size < this.size ? this.spawn() : null;
  }

  private spawn(): Slot {
    const slot: Slot = { worker: new Worker(this.workerUrl), job: null, timer: null };
    // Thread ociosa não segura o processo; ela é "ref" só enquanto há operação em curso (ver `dispatch`).
    slot.worker.unref();
    slot.worker.on('message', (response: BcryptResponse) => this.finish(slot, response));
    slot.worker.on('error', (err) => this.lose(slot, err));
    slot.worker.on('exit', () => this.lose(slot, null));
    this.slots.add(slot);
    return slot;
  }

  private dispatch(slot: Slot, job: Job): void {
    // Começou a rodar: deixa de ocupar lugar de espera do balde de origem.
    this.dropOrigin(job.origin);
    slot.job = job;
    slot.worker.ref();
    this.active += 1;
    this.peakActive = Math.max(this.peakActive, this.active);
    // O prazo conta da hora em que a operação COMEÇA a rodar (a espera na fila não entra).
    slot.timer = setTimeout(() => this.expire(slot, job), this.jobTimeoutMs);
    slot.timer.unref();
    slot.worker.postMessage(job.request);
  }

  /** Estouro do prazo: a vaga volta já (`lose`) e a thread é morta, para o bcrypt travado não seguir gastando CPU. */
  private expire(slot: Slot, job: Job): void {
    if (slot.job !== job) return; // terminou no mesmo instante
    this.timedOut += 1;
    this.lose(slot, null, 'Timeout');
    void slot.worker.terminate().catch(() => undefined);
  }

  private clearTimer(slot: Slot): void {
    if (slot.timer) clearTimeout(slot.timer);
    slot.timer = null;
  }

  private finish(slot: Slot, response: BcryptResponse): void {
    const job = slot.job;
    if (!job) return; // mensagem tardia de uma thread já dada como perdida
    this.clearTimer(slot);
    slot.job = null;
    slot.worker.unref();
    this.active -= 1;
    this.completed += 1;
    if (response.ok) job.resolve(response.value);
    else job.reject(new BcryptWorkerError(response.errorName));
    this.afterRelease();
  }

  /** A thread morreu (erro, saída, prazo ou fechamento): a operação em curso falha e a vaga é reposta sob demanda. */
  private lose(slot: Slot, err: Error | null, reason?: string): void {
    if (!this.slots.delete(slot)) return;
    this.clearTimer(slot);
    const job = slot.job;
    slot.job = null;
    if (job) {
      this.active -= 1;
      job.reject(new BcryptWorkerError(reason ?? err?.name ?? 'WorkerExited'));
    }
    this.afterRelease();
  }

  private afterRelease(): void {
    while (this.waiting.length > 0) {
      const slot = this.idleSlot();
      if (!slot) break;
      this.dispatch(slot, this.waiting.shift()!);
    }
    if (this.active === 0) for (const resolve of this.idleWaiters.splice(0)) resolve();
  }
}

/** Padrão do tamanho da pista dos apps: deixa uma CPU para o laço principal e o banco, no máximo 2 (o que o custo 12 pede). */
function defaultAppConcurrency(): number {
  return Math.min(2, Math.max(1, availableParallelism() - 1));
}

const appPoolEnv = (env: NodeJS.ProcessEnv) =>
  z
    .object({
      /** Operações de bcrypt simultâneas na pista dos apps (1 a 8). Valor inválido volta ao padrão. */
      AUTH_BCRYPT_CONCURRENCY: z.coerce.number().int().min(1).max(8).catch(defaultAppConcurrency()),
      /** Operações esperando vaga (0 a 64); a seguinte responde 503. A espera máxima é fila / concorrência × ~0,5 s. */
      AUTH_BCRYPT_QUEUE_MAX: z.coerce.number().int().min(0).max(64).catch(8),
      /** Lugares que um balde de IP (IPv4 ou /48 IPv6) segura da pista ao mesmo tempo (1 a 8). */
      AUTH_BCRYPT_MAX_PER_ORIGIN: z.coerce.number().int().min(1).max(8).catch(DEFAULT_MAX_PER_ORIGIN),
    })
    .parse({
      AUTH_BCRYPT_CONCURRENCY: env['AUTH_BCRYPT_CONCURRENCY'],
      AUTH_BCRYPT_QUEUE_MAX: env['AUTH_BCRYPT_QUEUE_MAX'],
      AUTH_BCRYPT_MAX_PER_ORIGIN: env['AUTH_BCRYPT_MAX_PER_ORIGIN'],
    });

/** Pista do painel admin: 1 operação por vez e fila curta. Fixa, de propósito: é pequena e não depende de configuração. */
const ADMIN_LANE_SIZE = 1;
const ADMIN_LANE_QUEUE = 4;

let appPool: BcryptPool | null = null;
let adminPool: BcryptPool | null = null;

/** Pista dos apps (passageiro/motorista): cadastro, login, verificação de e-mail e redefinição de senha. */
export function appBcrypt(env: NodeJS.ProcessEnv = process.env): BcryptPool {
  if (!appPool) {
    const cfg = appPoolEnv(env);
    appPool = new BcryptPool('app', cfg.AUTH_BCRYPT_CONCURRENCY, cfg.AUTH_BCRYPT_QUEUE_MAX, { maxPerOrigin: cfg.AUTH_BCRYPT_MAX_PER_ORIGIN });
  }
  return appPool;
}

/** Pista do painel admin: login e reautenticação. Separada da dos apps para que uma rajada pública não a esgote. */
export function adminBcrypt(): BcryptPool {
  adminPool ??= new BcryptPool('admin', ADMIN_LANE_SIZE, ADMIN_LANE_QUEUE);
  return adminPool;
}

/**
 * Toma o lugar na pista dos apps ANTES de reservar tentativa, gravar contador ou criar conta (B-1): sem lugar, a rota
 * responde 503 sem ter gravado nada. Fechar com `withBcryptReservation` (ou `release()` num `finally`).
 */
export function reserveAppBcrypt(origin: string | null): BcryptReservation {
  return appBcrypt().reserve(origin);
}

/** O mesmo para a pista do admin: a espera progressiva do dono não cresce por uma senha que nem chegou a ser comparada. */
export function reserveAdminBcrypt(origin: string | null): BcryptReservation {
  return adminBcrypt().reserve(origin);
}

/** Roda `body` com a reserva e a devolve ao terminar (inclusive por erro ou por desfecho que não usa o bcrypt, como o 429). */
export async function withBcryptReservation<T>(reservation: BcryptReservation, body: (reservation: BcryptReservation) => Promise<T>): Promise<T> {
  try {
    return await body(reservation);
  } finally {
    reservation.release();
  }
}

/** Encerra as pistas (desligamento do servidor e dos testes). Um novo uso cria pistas novas. */
export async function closeBcryptPools(): Promise<void> {
  const pools = [appPool, adminPool];
  appPool = null;
  adminPool = null;
  await Promise.all(pools.map((pool) => pool?.close()));
}
