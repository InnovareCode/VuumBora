/**
 * Configuração de geografia e cotação (M4, fatias G3/G4), lida do ambiente À PARTE de `env.ts`: nada aqui derruba o boot.
 * Ausente ou inválida, a rota que depende dela falha FECHADO e o boot registra o motivo — só NOMES de variável, nunca valor.
 *
 *   MAPBOX_SERVER_TOKEN      token do Mapbox SÓ do servidor (V1 do plano: nunca o EXPO_PUBLIC_*, nunca em bundle de app).
 *                            Ausente: busca, pino e cotação respondem 503 `geo_unavailable`; área e categorias seguem.
 *   QUOTE_SIGNING_SECRET     segredo do HMAC da cotação (N9), >= 32 caracteres. Ausente: cotar responde 503 `unavailable`.
 *   ALLOW_TEST_FARES         `true` deixa a tarifa de TESTE cotar (desenvolvimento e homologação). Qualquer outro valor = falso
 *                            (N8: em produção a tarifa de teste dá 503 `fare_not_configured`).
 *   GEO_CACHE_TTL_SECONDS    prazo do cache das respostas do Mapbox, 0..600 (padrão 300; 0 desliga).
 *   GEO_SEARCH_PER_MINUTE    buscas por conta por minuto (padrão 60).
 *   GEO_REVERSE_PER_MINUTE   pinos por conta por minuto (padrão 30).
 *   QUOTES_PER_MINUTE        cotações por conta por minuto (padrão 20).
 *   GEO_ROUTES_RATE_LIMIT_MAX  teto por IP (IPv4 ou /64) por minuto em cada rota de geografia/cotação (padrão 300), além do por conta.
 *   MAPBOX_TIMEOUT_MS        tempo máximo de cada chamada ao Mapbox, 500..10000 (padrão 3000).
 *   MAPBOX_DIRECTIONS_PROFILE  driving-traffic (padrão: duração com trânsito) ou driving.
 */

export type DirectionsProfile = 'driving-traffic' | 'driving';

export interface GeoConfig {
  /** `null` = sem token: busca, pino e cotação em 503 `geo_unavailable`. */
  readonly mapboxToken: string | null;
  /** `null` = sem segredo: cotar em 503 `unavailable`. */
  readonly quoteSigningSecret: string | null;
  readonly allowTestFares: boolean;
  readonly searchCacheTtlMs: number;
  readonly searchPerMinute: number;
  readonly reversePerMinute: number;
  readonly quotesPerMinute: number;
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
  const value = /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
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

  return {
    config: {
      mapboxToken,
      quoteSigningSecret,
      allowTestFares: trimmed(source, 'ALLOW_TEST_FARES') === 'true',
      searchCacheTtlMs: integerIn(source, 'GEO_CACHE_TTL_SECONDS', 0, 600, 300, problems) * 1000,
      searchPerMinute: integerIn(source, 'GEO_SEARCH_PER_MINUTE', 1, 10_000, 60, problems),
      reversePerMinute: integerIn(source, 'GEO_REVERSE_PER_MINUTE', 1, 10_000, 30, problems),
      quotesPerMinute: integerIn(source, 'QUOTES_PER_MINUTE', 1, 10_000, 20, problems),
      routesIpRateLimitMax: integerIn(source, 'GEO_ROUTES_RATE_LIMIT_MAX', 1, 100_000, 300, problems),
      mapboxTimeoutMs: integerIn(source, 'MAPBOX_TIMEOUT_MS', 500, 10_000, 3000, problems),
      directionsProfile,
    },
    problems,
  };
}
