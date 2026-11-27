/**
 * Teto DIÁRIO e GLOBAL de chamadas ao Mapbox, por motor (M4, G3/G4): o disjuntor de gasto. Os limites por conta e por IP
 * seguram uma conta ou um endereço; este segura a soma de todas as contas. Passou do teto, o motor para até o dia seguinte
 * (no fuso de Natal, UTC−3 fixo, sem horário de verão): a chamada nem sai, a rota responde 503 `geo_unavailable`, e o log
 * recebe UMA vez por motor por dia o evento `geo_budget_exhausted` (com o motor e o teto; nada do pedido).
 *
 * Conta a CHAMADA LÓGICA ao Mapbox (o que o cache não respondeu): a repetição única em falha de rede ou 5xx não conta de novo
 * (falha do Mapbox não costuma ser cobrada). Teto 0 = motor desligado.
 *
 * Em memória, um processo: com uma instância só da API (Easypanel) o teto é o do serviço inteiro. Reiniciar o processo zera a
 * contagem do dia (limitação aceita: reiniciar não está nas mãos de quem chama a API). Com várias instâncias, o teto vale
 * por instância — dividir o valor pelo número delas.
 */
import { GeoProviderError, type GeoProvider } from './mapbox.js';

export type GeoEngine = 'geocoding' | 'searchbox' | 'reverse' | 'directions';

/** Natal fica em UTC−3 o ano todo. */
const NATAL_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function natalDayOf(nowMs: number): number {
  return Math.floor((nowMs - NATAL_OFFSET_MS) / DAY_MS);
}

export class GeoDailyBudget {
  private day = Number.NaN;
  private used: Record<GeoEngine, number> = { geocoding: 0, searchbox: 0, reverse: 0, directions: 0 };
  private announced = new Set<GeoEngine>();

  constructor(
    private readonly limits: Readonly<Record<GeoEngine, number>>,
    /** Chamado UMA vez por motor por dia, quando o motor bate no teto. */
    private readonly onExhausted: (engine: GeoEngine, dailyLimit: number) => void,
    private readonly now: () => number = Date.now,
  ) {}

  /** Reserva uma chamada do motor. `false` = teto do dia atingido (a chamada não deve sair). */
  take(engine: GeoEngine): boolean {
    const today = natalDayOf(this.now());
    if (today !== this.day) {
      this.day = today;
      this.used = { geocoding: 0, searchbox: 0, reverse: 0, directions: 0 };
      this.announced.clear();
    }
    if (this.used[engine] >= this.limits[engine]) {
      if (!this.announced.has(engine)) {
        this.announced.add(engine);
        this.onExhausted(engine, this.limits[engine]);
      }
      return false;
    }
    this.used[engine] += 1;
    return true;
  }

  /** Quanto cada motor já gastou hoje (para teste e diagnóstico). */
  usage(): Readonly<Record<GeoEngine, number>> {
    return { ...this.used };
  }
}

/** A porta do Mapbox passando pelo teto: motor sem saldo lança `GeoProviderError('budget_exhausted')` sem chamar nada. */
export function withDailyBudget(provider: GeoProvider, budget: GeoDailyBudget): GeoProvider {
  const guard = (engine: GeoEngine) => {
    if (!budget.take(engine)) throw new GeoProviderError('budget_exhausted');
  };
  return {
    async forward(engine, request) {
      guard(engine);
      return provider.forward(engine, request);
    },
    async reverse(point) {
      guard('reverse');
      return provider.reverse(point);
    },
    async directions(origin, destination) {
      guard('directions');
      return provider.directions(origin, destination);
    },
  };
}
