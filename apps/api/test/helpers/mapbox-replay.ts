/**
 * Mapbox de MENTIRA para os testes (M4, G3/G4): um `fetch` que responde pela URL sem o token. Nenhum teste chama o Mapbox.
 *
 * Duas fontes de resposta:
 *  - `synthetic` (padrão, roda no CI): `test/fixtures/mapbox/synthetic.ts`, respostas INVENTADAS no formato do Mapbox;
 *  - `local`: `test/fixtures/mapbox/recorded.local.json`, respostas REAIS gravadas por `scripts/record-mapbox-fixtures.ts`,
 *    fora do git (repositório público; termos da geocodificação temporária). Só a amostra da F10 usa, e pula sem ela.
 *
 * URL sem resposta FALHA alto (lança com a URL sem token): o pedido mudou (parâmetro, caixa da área, proximidade) e a
 * resposta precisa ser refeita — nunca "responde vazio" em silêncio.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMapboxProvider, urlWithoutToken, type GeoProvider } from '../../src/lib/mapbox.js';
import { loadGeoConfig, type GeoConfig } from '../../src/lib/geo-config.js';
import { SYNTHETIC_RESPONSES } from '../fixtures/mapbox/synthetic.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES_DIR = path.resolve(here, '../fixtures/mapbox');

/** Token de mentira no formato certo: o adaptador o põe na URL; a resposta é procurada sem ele. */
export const FAKE_TOKEN = 'pk.dGVzdGUtZG8tc2Vydmlkb3I.cmVzcG9zdGFzLWdyYXZhZGFz';

type Responses = Readonly<Record<string, { readonly status: number; readonly body: unknown }>>;
export type ReplaySource = 'synthetic' | 'local';

/** A gravação REAL local (fora do git). Ausente = a amostra da F10 pula. */
export const LOCAL_RECORDING = path.join(FIXTURES_DIR, 'recorded.local.json');
export const hasLocalRecording = (): boolean => existsSync(LOCAL_RECORDING);

let local: Responses | undefined;
export function responsesOf(source: ReplaySource): Responses {
  if (source === 'synthetic') return SYNTHETIC_RESPONSES;
  local ??= (JSON.parse(readFileSync(LOCAL_RECORDING, 'utf8')) as { responses: Responses }).responses;
  return local;
}

export interface ReplayFetch {
  readonly fetch: typeof fetch;
  /** URLs (sem token) pedidas, na ordem. */
  readonly calls: string[];
  /** A próxima chamada cuja URL contém `fragment` falha assim (uma vez cada). */
  failNext(fragment: string, failure: { status: number } | 'network' | 'timeout'): void;
}

export function replayFetch(source: ReplaySource = 'synthetic'): ReplayFetch {
  const responses = responsesOf(source);
  const calls: string[] = [];
  const failures: { fragment: string; failure: { status: number } | 'network' | 'timeout' }[] = [];
  const replay = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes(`access_token=${FAKE_TOKEN}`)) throw new Error('replay: chamada sem o token do teste');
    const key = urlWithoutToken(url);
    calls.push(key);
    const forcedIndex = failures.findIndex((entry) => key.includes(entry.fragment));
    if (forcedIndex !== -1) {
      const [forced] = failures.splice(forcedIndex, 1);
      if (forced!.failure === 'network') throw new TypeError('fetch failed');
      if (forced!.failure === 'timeout') {
        // Espera o aborto do adaptador (o tempo máximo da chamada).
        await new Promise<void>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
      } else {
        return new Response(JSON.stringify({ message: 'falha simulada' }), { status: forced!.failure.status, headers: { 'content-type': 'application/json' } });
      }
    }
    const hit = responses[key];
    if (!hit) throw new Error(`replay (${source}): sem resposta para ${key}`);
    return new Response(JSON.stringify(hit.body), { status: hit.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  return {
    fetch: replay,
    calls,
    failNext(fragment, failure) {
      failures.push({ fragment, failure });
    },
  };
}

/** Configuração de geografia dos testes (token de mentira, segredo de teste, tarifa de teste liberada), com ajustes. */
export function testGeoConfig(overrides: Partial<GeoConfig> = {}): GeoConfig {
  const { config } = loadGeoConfig({
    MAPBOX_SERVER_TOKEN: FAKE_TOKEN,
    QUOTE_SIGNING_SECRET: 'segredo-de-teste-da-cotacao-0123456789abcdef',
    ALLOW_TEST_FARES: 'true',
    GEO_ROUTES_RATE_LIMIT_MAX: '100000',
    GEO_SEARCH_PER_MINUTE: '10000',
    GEO_REVERSE_PER_MINUTE: '10000',
    QUOTES_PER_MINUTE: '10000',
  });
  return { ...config, ...overrides };
}

export function replayProvider(replay: ReplayFetch, config: GeoConfig = testGeoConfig()): GeoProvider {
  return createMapboxProvider({ token: FAKE_TOKEN, profile: config.directionsProfile, timeoutMs: config.mapboxTimeoutMs, fetch: replay.fetch, retryDelayMs: 0 });
}
