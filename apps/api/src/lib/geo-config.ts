/**
 * Configuração de geografia e cotação (M4, fatias G3/G4), lida do ambiente À PARTE de `env.ts`: nada aqui derruba o boot.
 * Ausente ou inválida, a rota que depende dela falha FECHADO e o boot registra o motivo — só NOMES de variável, nunca valor.
 *
 *   MAPBOX_SERVER_TOKEN      token do Mapbox SÓ do servidor (V1 do plano: nunca o EXPO_PUBLIC_*, nunca em bundle de app).
 *                            Ausente: busca, pino e cotação respondem 503 `geo_unavailable`; área e categorias seguem.
 *   QUOTE_SIGNING_SECRET     segredo do HMAC da cotação (N9), >= 32 caracteres. Ausente: cotar responde 503 `unavailable`.
 *   ALLOW_TEST_FARES         `true` deixa a tarifa de TESTE cotar (desenvolvimento e homologação). Qualquer outro valor = falso
 *                            (N8: em produção a tarifa de teste dá 503 `fare_not_configured`).
 *   GEO_CACHE_TTL_SECONDS    prazo do cache das respostas do Mapbox, 0..600. PADRÃO 0 (desligado): os termos do Mapbox para
 *                            resultado temporário restringem guardá-lo; só liga por configuração explícita, depois da
 *                            decisão do dono sobre o plano/acordo com o Mapbox.
 *   GEO_SEARCH_PER_MINUTE / GEO_SEARCH_PER_DAY     buscas por conta (padrão 60 por minuto, 600 por dia).
 *   GEO_REVERSE_PER_MINUTE / GEO_REVERSE_PER_DAY   pinos por conta (padrão 30 por minuto, 300 por dia).
 *   QUOTES_PER_MINUTE / QUOTES_PER_DAY             cotações por conta (padrão 20 por minuto, 150 por dia).
 *   GEO_DAILY_BUDGET_GEOCODING / _SEARCHBOX / _REVERSE / _DIRECTIONS
 *                            teto GLOBAL de chamadas ao Mapbox por dia (de Natal), por motor (padrões 2000, 1000, 1000,
 *                            3000; 0 desliga o motor). Acima dele o motor para até o dia seguinte: 503 `geo_unavailable` e o
 *                            evento `geo_budget_exhausted` no log. É o disjuntor de gasto; o alerta de cobrança no painel do
 *                            Mapbox é a segunda linha.
 *   GEO_ROUTES_RATE_LIMIT_MAX  teto por IP (IPv4 ou /64) por minuto em cada rota de geografia/cotação (padrão 300), além do por conta.
 *   MAPBOX_TIMEOUT_MS        tempo máximo de cada chamada ao Mapbox, 500..10000 (padrão 3000).
 *   MAPBOX_DIRECTIONS_PROFILE  driving-traffic (padrão: duração com trânsito) ou driving.
 */
import type { GeoEngine } from './geo-budget.js';

export type DirectionsProfile = 'driving-traffic' | 'driving';

export interface GeoConfig {
  /** `null` = sem token: busca, pino e cotação em 503 `geo_unavailable`. */
  readonly mapboxToken: string | null;
  /** `null` = sem segredo: cotar em 503 `unavailable`. */
  readonly quoteSigningSecret: string | null;
  readonly allowTestFares: boolean;
  /** 0 = sem cache (padrão). */
  readonly searchCacheTtlMs: number;
  readonly searchPerMinute: number;
  readonly searchPerDay: number;
  readonly reversePerMinute: number;
  readonly reversePerDay: number;
  readonly quotesPerMinute: number;
  readonly quotesPerDay: number;
  /** Teto diário GLOBAL de chamadas ao Mapbox, por motor. */
  readonly dailyBudget: Readonly<Record<GeoEngine, number>>;
  readonly routesIpRateLimitMax: number;
  readonly mapboxTimeoutMs: number;
  readonly directionsProfile: DirectionsProfile;
}

type Source = Readonly<Record<string, string | undefined>>;

const trimmed = (source: Source, name: string): string => (source[name] ?? '').trim();

/** Token do Mapbox: `pk.`/`sk.` + payload. Não confere a validade na conta (isso só a primeira chamada diz). */
const MAPBOX_TOKEN_PATTERN = /^(pk|sk)\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function integerIn(source: Source, name: string, min: number, max: number, fallback: number, problems: string[]): number {
  const raw = trimmed(source, name);
  if (raw === '') return fallback;
  const value = /^\d{1,8}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(value) || value < min || value > max) {
    problems.push(`${name}: inteiro entre ${min} e ${max} (usando o padrão ${fallback})`);
    return fallback;
  }
  return value;
}

export function loadGeoConfig(source: Source = process.env): { readonly config: GeoConfig; readonly problems: readonly string[] } {
  const problems: string[] = [];

  const tokenRaw = trimmed(source, 'MAPBOX_SERVER_TOKEN');
  let mapboxToken: string | null = null;
  if (tokenRaw === '') problems.push('MAPBOX_SERVER_TOKEN: ausente (busca, pino e cotação respondem 503 geo_unavailable)');
  else if (!MAPBOX_TOKEN_PATTERN.test(tokenRaw)) problems.push('MAPBOX_SERVER_TOKEN: formato inválido (pk.… ou sk.…)');
  else mapboxToken = tokenRaw;

  const secretRaw = trimmed(source, 'QUOTE_SIGNING_SECRET');
  let quoteSigningSecret: string | null = null;
  if (secretRaw === '') problems.push('QUOTE_SIGNING_SECRET: ausente (cotar responde 503)');
  else if (secretRaw.length < 32) problems.push('QUOTE_SIGNING_SECRET: precisa de ao menos 32 caracteres');
  else quoteSigningSecret = secretRaw;

  const profileRaw = trimmed(source, 'MAPBOX_DIRECTIONS_PROFILE');
  let directionsProfile: DirectionsProfile = 'driving-traffic';
  if (profileRaw === 'driving' || profileRaw === 'driving-traffic') directionsProfile = profileRaw;
  else if (profileRaw !== '') problems.push('MAPBOX_DIRECTIONS_PROFILE: driving-traffic ou driving (usando driving-traffic)');

  const budget = (name: string, fallback: number) => integerIn(source, name, 0, 10_000_000, fallback, problems);

  return {
    config: {
      mapboxToken,
      quoteSigningSecret,
      allowTestFares: trimmed(source, 'ALLOW_TEST_FARES') === 'true',
      searchCacheTtlMs: integerIn(source, 'GEO_CACHE_TTL_SECONDS', 0, 600, 0, problems) * 1000,
      searchPerMinute: integerIn(source, 'GEO_SEARCH_PER_MINUTE', 1, 10_000, 60, problems),
      searchPerDay: integerIn(source, 'GEO_SEARCH_PER_DAY', 1, 1_000_000, 600, problems),
      reversePerMinute: integerIn(source, 'GEO_REVERSE_PER_MINUTE', 1, 10_000, 30, problems),
      reversePerDay: integerIn(source, 'GEO_REVERSE_PER_DAY', 1, 1_000_000, 300, problems),
      quotesPerMinute: integerIn(source, 'QUOTES_PER_MINUTE', 1, 10_000, 20, problems),
      quotesPerDay: integerIn(source, 'QUOTES_PER_DAY', 1, 1_000_000, 150, problems),
      dailyBudget: {
        geocoding: budget('GEO_DAILY_BUDGET_GEOCODING', 2000),
        searchbox: budget('GEO_DAILY_BUDGET_SEARCHBOX', 1000),
        reverse: budget('GEO_DAILY_BUDGET_REVERSE', 1000),
        directions: budget('GEO_DAILY_BUDGET_DIRECTIONS', 3000),
      },
      routesIpRateLimitMax: integerIn(source, 'GEO_ROUTES_RATE_LIMIT_MAX', 1, 100_000, 300, problems),
      mapboxTimeoutMs: integerIn(source, 'MAPBOX_TIMEOUT_MS', 500, 10_000, 3000, problems),
      directionsProfile,
    },
    problems,
  };
}
