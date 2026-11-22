/**
 * Teto GLOBAL de concorrência do bcrypt, fora da thread principal (revisão S1 rodada 3, A-1).
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
 *  - o teto vale por PROCESSO (cada réplica tem o seu).
 *
 * Por que threads com o bcryptjs, e não o `bcrypt` nativo nem o argon2: o algoritmo e o formato do hash ficam
 * IDÊNTICOS (mesma biblioteca; todo hash já gravado, de contas e de admins, continua válido sem migração nem
 * recálculo), não entra dependência nova (nada de binário nativo na imagem Alpine, nada de mexer no
 * package-lock), e o custo medido é parecido (478 ms contra 406 ms por comparação no nativo, nesta máquina).
 * O ganho real vem de tirar o bcrypt da thread principal e de limitar a concorrência, e as threads fazem os dois.
 *
 * Nunca logar a senha nem o hash: nada daqui os registra, e os erros do worker voltam sem mensagem.
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { z } from 'zod';
import type { BcryptRequest, BcryptResponse } from './bcrypt-worker.js';

/** Sem vaga e sem lugar na fila (ou pista em desligamento): a rota traduz em 503 + `Retry-After`. */
export class BcryptBusyError extends Error {
  readonly code = 'BCRYPT_BUSY';
  constructor(readonly lane: string) {
    super('bcrypt_busy');
    this.name = 'BcryptBusyError';
  }
}

/** A thread caiu ou devolveu erro no meio de uma operação. Sem detalhe: a mensagem poderia carregar dado de senha. */
export class BcryptWorkerError extends Error {
  readonly code = 'BCRYPT_WORKER_FAILED';
  constructor(readonly reason: string) {
    super('bcrypt_worker_failed');
    this.name = 'BcryptWorkerError';
  }
}

/** Segundos sugeridos ao cliente quando a pista está cheia (a fila esvazia em poucos segundos). */
export const BCRYPT_BUSY_RETRY_AFTER_SECONDS = 3;

// Em produção o worker é o `.js` compilado ao lado deste arquivo; sob o `tsx` (testes, `npm run dev`) é o `.ts`
// (as threads herdam o `--import tsx` do processo).
const WORKER_URL = new URL(import.meta.url.endsWith('.ts') ? './bcrypt-worker.ts' : './bcrypt-worker.js', import.meta.url);

interface Job {
  readonly request: BcryptRequest;
  readonly resolve: (value: string | boolean) => void;
  readonly reject: (err: Error) => void;
}

interface Slot {
  readonly worker: Worker;
  job: Job | null;
}

export interface BcryptPoolStats {
  /** Threads criadas até agora (nascem sob demanda, até `size`). */
  readonly workers: number;
  readonly active: number;
  readonly waiting: number;
  readonly peakActive: number;
  readonly peakWaiting: number;
  /** Chamadas recusadas por falta de vaga e de fila. */
  readonly rejected: number;
  readonly completed: number;
}

export class BcryptPool {
  private readonly slots = new Set<Slot>();
  private readonly waiting: Job[] = [];
  private readonly idleWaiters: Array<() => void> = [];
  private closing = false;
  private active = 0;
  private peakActive = 0;
  private peakWaiting = 0;
  private rejected = 0;
  private completed = 0;

  constructor(
    readonly lane: string,
    /** Operações simultâneas (= threads). O teto de concorrência da pista. */
    readonly size: number,
    /** Quantas esperam por vaga; a seguinte é recusada. */
    readonly maxQueue: number,
  ) {
    if (!Number.isInteger(size) || size < 1) throw new RangeError('bcrypt pool: size >= 1');
    if (!Number.isInteger(maxQueue) || maxQueue < 0) throw new RangeError('bcrypt pool: maxQueue >= 0');
  }

  hash(password: string, cost: number): Promise<string> {
    return this.submit({ op: 'hash', password, cost }) as Promise<string>;
  }

  compare(password: string, hash: string): Promise<boolean> {
    return this.submit({ op: 'compare', password, hash }) as Promise<boolean>;
  }

  /** Verdadeiro quando QUALQUER chamada nova seria recusada agora. Serve para recusar cedo, antes de gastar trabalho no banco. */
  get saturated(): boolean {
    return this.closing || (this.active >= this.size && this.waiting.length >= this.maxQueue);
  }

  /** Lança `BcryptBusyError` se a pista está cheia (ver `saturated`). */
  assertCapacity(): void {
    if (this.saturated) throw new BcryptBusyError(this.lane);
  }

  stats(): BcryptPoolStats {
    return { workers: this.slots.size, active: this.active, waiting: this.waiting.length, peakActive: this.peakActive, peakWaiting: this.peakWaiting, rejected: this.rejected, completed: this.completed };
  }

  /** Recusa a fila, espera as operações em curso e encerra as threads. Uma pista fechada recusa tudo. */
  async close(): Promise<void> {
    this.closing = true;
    for (const job of this.waiting.splice(0)) job.reject(new BcryptBusyError(this.lane));
    if (this.active > 0) await new Promise<void>((resolve) => this.idleWaiters.push(resolve));
    await Promise.all([...this.slots].map((slot) => slot.worker.terminate()));
    this.slots.clear();
  }

  private submit(request: BcryptRequest): Promise<string | boolean> {
    return new Promise((resolve, reject) => {
      if (this.closing) {
        reject(new BcryptBusyError(this.lane));
        return;
      }
      const job: Job = { request, resolve, reject };
      const slot = this.idleSlot();
      if (slot) {
        this.dispatch(slot, job);
        return;
      }
      if (this.waiting.length >= this.maxQueue) {
        this.rejected += 1;
        reject(new BcryptBusyError(this.lane));
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
    const slot: Slot = { worker: new Worker(WORKER_URL), job: null };
    // Thread ociosa não segura o processo; ela é "ref" só enquanto há operação em curso (ver `dispatch`).
    slot.worker.unref();
    slot.worker.on('message', (response: BcryptResponse) => this.finish(slot, response));
    slot.worker.on('error', (err) => this.lose(slot, err));
    slot.worker.on('exit', () => this.lose(slot, null));
    this.slots.add(slot);
    return slot;
  }

  private dispatch(slot: Slot, job: Job): void {
    slot.job = job;
    slot.worker.ref();
    this.active += 1;
    this.peakActive = Math.max(this.peakActive, this.active);
    slot.worker.postMessage(job.request);
  }

  private finish(slot: Slot, response: BcryptResponse): void {
    const job = slot.job;
    if (!job) return;
    slot.job = null;
    slot.worker.unref();
    this.active -= 1;
    this.completed += 1;
    if (response.ok) job.resolve(response.value);
    else job.reject(new BcryptWorkerError(response.errorName));
    this.afterRelease();
  }

  /** A thread morreu (erro ou saída): a operação em curso falha e a vaga é reposta sob demanda. */
  private lose(slot: Slot, err: Error | null): void {
    if (!this.slots.delete(slot)) return;
    const job = slot.job;
    slot.job = null;
    if (job) {
      this.active -= 1;
      job.reject(new BcryptWorkerError(err?.name ?? 'WorkerExited'));
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
    })
    .parse({ AUTH_BCRYPT_CONCURRENCY: env['AUTH_BCRYPT_CONCURRENCY'], AUTH_BCRYPT_QUEUE_MAX: env['AUTH_BCRYPT_QUEUE_MAX'] });

/** Pista do painel admin: 1 operação por vez e fila curta. Fixa, de propósito: é pequena e não depende de configuração. */
const ADMIN_LANE_SIZE = 1;
const ADMIN_LANE_QUEUE = 4;

let appPool: BcryptPool | null = null;
let adminPool: BcryptPool | null = null;

/** Pista dos apps (passageiro/motorista): cadastro, login, verificação de e-mail e redefinição de senha. */
export function appBcrypt(env: NodeJS.ProcessEnv = process.env): BcryptPool {
  if (!appPool) {
    const cfg = appPoolEnv(env);
    appPool = new BcryptPool('app', cfg.AUTH_BCRYPT_CONCURRENCY, cfg.AUTH_BCRYPT_QUEUE_MAX);
  }
  return appPool;
}

/** Pista do painel admin: login e reautenticação. Separada da dos apps para que uma rajada pública não a esgote. */
export function adminBcrypt(): BcryptPool {
  adminPool ??= new BcryptPool('admin', ADMIN_LANE_SIZE, ADMIN_LANE_QUEUE);
  return adminPool;
}

/**
 * Recusa cedo (antes de qualquer trabalho no banco) quando a pista dos apps está cheia: nada é reservado nem
 * gravado para uma requisição que não teria como ser atendida. Sobra uma janela entre esta checagem e o uso
 * (várias requisições chegam juntas); nela a própria chamada ao bcrypt recusa.
 */
export function assertAppBcryptCapacity(): void {
  appBcrypt().assertCapacity();
}

/** O mesmo para a pista do admin: o contador de falhas do par não deve registrar uma senha que nem chegou a ser comparada. */
export function assertAdminBcryptCapacity(): void {
  adminBcrypt().assertCapacity();
}

/** Encerra as pistas (desligamento do servidor e dos testes). Um novo uso cria pistas novas. */
export async function closeBcryptPools(): Promise<void> {
  const pools = [appPool, adminPool];
  appPool = null;
  adminPool = null;
  await Promise.all(pools.map((pool) => pool?.close()));
}
