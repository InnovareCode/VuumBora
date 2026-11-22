/**
 * Guarda por poucos segundos o resultado do `/healthz` (revisão S1 rodada 3c, B-7). O endpoint não tem limite de taxa (o
 * orquestrador o chama sem parar e uma sonda externa também) e cada chamada consultava o banco, que tem 5 conexões e as divide com
 * login e cadastro: uma enxurrada de `/healthz` disputava as mesmas conexões.
 *
 *  - os DOIS resultados ficam guardados (banco ok e banco fora): com o banco fora, cada consulta espera o prazo de conexão (5 s) e
 *    sem guardar a falha as sondas empilhariam tentativas;
 *  - pedidos simultâneos de uma entrada vencida compartilham UMA consulta (sem debandada quando o prazo vence);
 *  - o prazo conta do FIM da consulta (de quando o resultado é CONHECIDO): uma consulta que falha só no prazo de 5 s da conexão e um
 *    TTL de 2 s deixariam a entrada já vencida ao nascer, e cada sonda em série dispararia uma nova espera de 5 s. A defasagem máxima
 *    passa a ser o TTL mais a duração da consulta (centenas de microssegundos com o banco de pé, 5 s com ele fora);
 *  - `ttlMs` 0 desliga o cache (cada chamada consulta; pedidos simultâneos ainda compartilham a consulta em curso);
 *  - o custo da defasagem: depois de uma queda do banco o orquestrador vê "ok" por até `ttlMs` a mais, e o inverso na volta.
 */
export class HealthCheckCache {
  private entry: { readonly expiresAt: number; readonly healthy: boolean } | null = null;
  private inflight: Promise<boolean> | null = null;

  constructor(
    private readonly ttlMs: number,
    /** Relógio injetável (os testes não dormem para vencer o prazo). */
    private readonly now: () => number = Date.now,
  ) {}

  get(check: () => Promise<boolean>): Promise<boolean> {
    if (this.entry && this.entry.expiresAt > this.now()) return Promise.resolve(this.entry.healthy);
    if (this.inflight) return this.inflight;

    const started = check()
      // Uma verificação que LANÇA conta como "fora" (e vale pelo prazo como qualquer resultado): o erro não sai daqui e a promessa nunca fica pendurada.
      .catch(() => false)
      .then((healthy) => {
        if (this.ttlMs > 0) this.entry = { expiresAt: this.now() + this.ttlMs, healthy };
        return healthy;
      })
      .finally(() => {
        this.inflight = null;
      });
    this.inflight = started;
    return started;
  }
}
