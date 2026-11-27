/**
 * Limite POR CONTA, em memória (M4, fatias G3/G4: busca, pino e cotação). O `@fastify/rate-limit` decide a chave em
 * `onRequest`, antes da autenticação, então só sabe do IP; a conta só existe depois do `requireAccount`. Este limite roda
 * DENTRO da rota, já com a conta da sessão.
 *
 * Janela fixa por conta (contador + início da janela). Simples de raciocinar e barato; o pior caso é 2× o teto na virada
 * da janela, aceitável para conter abuso de uma conta (o custo real que protege é a cota do Mapbox e a escrita de cotação).
 *
 * Memória limitada: acima de `maxKeys` contas, as janelas vencidas são varridas; se ainda assim passar, as mais antigas
 * saem (a conta volta a ter a cota cheia — falha aberta para uma conta, nunca para o serviço). Um processo, uma memória.
 */
interface Window {
  readonly startedAt: number;
  count: number;
}

export type TakeResult = { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

export class AccountRateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys: number = 50_000,
  ) {}

  /**
   * O que `take` responderia, SEM consumir. Serve para conferir duas janelas (minuto e dia) antes de gastar qualquer uma: a
   * recusa numa não pode comer a cota da outra.
   */
  check(accountId: string): TakeResult {
    const now = this.now();
    const window = this.windows.get(accountId);
    if (!window || now - window.startedAt >= this.windowMs || window.count < this.max) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((window.startedAt + this.windowMs - now) / 1000)) };
  }

  /** Conta UMA chamada da conta. Recusada não consome (quem martela não estende a própria espera). */
  take(accountId: string): TakeResult {
    const now = this.now();
    let window = this.windows.get(accountId);
    if (!window || now - window.startedAt >= this.windowMs) {
      window = { startedAt: now, count: 0 };
      this.windows.set(accountId, window);
      this.prune(now);
    }
    if (window.count >= this.max) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((window.startedAt + this.windowMs - now) / 1000)) };
    }
    window.count += 1;
    return { allowed: true };
  }

  private prune(now: number): void {
    if (this.windows.size <= this.maxKeys) return;
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= this.windowMs) this.windows.delete(key);
    }
    while (this.windows.size > this.maxKeys) {
      const oldest = this.windows.keys().next();
      if (oldest.done) break;
      this.windows.delete(oldest.value);
    }
  }
}
