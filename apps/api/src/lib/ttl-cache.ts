/**
 * Cache em memória com prazo e teto de entradas (M4, fatia G3: "cache curto" da busca e dos catálogos de geografia).
 *
 *  - pedidos simultâneos da MESMA chave dividem UMA carga (sem debandada no Mapbox nem no banco);
 *  - erro NUNCA fica guardado: a próxima chamada tenta de novo;
 *  - o prazo conta do INÍCIO da carga (a defasagem máxima é o TTL, não TTL + duração da chamada);
 *  - teto de entradas com despejo da mais antiga (ordem de inserção do `Map`; um acerto reinsere a entrada no fim): uma
 *    enxurrada de consultas diferentes não cresce a memória sem limite;
 *  - `ttlMs <= 0` desliga (toda chamada carrega).
 *
 * Um processo, uma memória: com uma instância só da API (Easypanel, `docs/plano-m3-m4.md`) basta; com várias, cada uma
 * tem o seu cache (o efeito é só menos acerto, nunca resposta errada).
 */
interface Entry<V> {
  readonly expiresAt: number;
  readonly value: V;
}

export class TtlCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly inflight = new Map<string, Promise<V>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    /** Relógio injetável (os testes não dormem para vencer o prazo). */
    private readonly now: () => number = Date.now,
  ) {}

  /** O valor da chave e se veio do cache (`hit`). Quem espera uma carga já em voo conta como acerto. */
  async get(key: string, load: () => Promise<V>): Promise<{ readonly value: V; readonly hit: boolean }> {
    if (this.ttlMs <= 0) return { value: await load(), hit: false };
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > this.now()) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return { value: cached.value, hit: true };
    }
    if (cached) this.entries.delete(key);
    const pending = this.inflight.get(key);
    if (pending) return { value: await pending, hit: true };

    const startedAt = this.now();
    const started = load()
      .then((value) => {
        this.entries.set(key, { expiresAt: startedAt + this.ttlMs, value });
        while (this.entries.size > this.maxEntries) {
          const oldest = this.entries.keys().next();
          if (oldest.done) break;
          this.entries.delete(oldest.value);
        }
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, started);
    return { value: await started, hit: false };
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }
}
