/**
 * Grava respostas REAIS do Mapbox para medir a busca com a amostra da F10 (M4, fatia G3). O arquivo fica SÓ NA MÁQUINA de
 * quem gravou: `test/fixtures/mapbox/recorded.local.json`, ignorado pelo git (decisão do Atlas, 27/11/2026: o repositório
 * é público e os termos da geocodificação temporária restringem guardar resultados). Sem ele, o teste da amostra
 * (`test/geo-search-f10-sample.test.ts`) PULA com o motivo escrito; o resto da suíte usa o fixture FICTÍCIO
 * (`test/fixtures/mapbox/synthetic.ts`), que roda no CI. A chave de cada resposta é a URL SEM o token (`urlWithoutToken`).
 *
 * O que grava (`test/fixtures/mapbox/recorded.local.json`):
 *  - as 100 consultas da amostra da F10 (`test/fixtures/mapbox/f10-sample.json`), nas DUAS fontes (Geocoding v6 e Search
 *    Box), com os parâmetros EXATOS da rota `GET /v1/geo/search?kind=any` sem `near` (proximidade = centro de Natal,
 *    caixa = a área semeada pela 0026);
 *  - as rotas (Directions) e os pinos (reverso) dos testes de cotação, listados abaixo.
 *
 * Os corpos são APARADOS para o que o adaptador lê (nome, endereço, contexto, coordenada, confiança, geometria da rota):
 * o arquivo fica pequeno e não guarda nada além do necessário. A URL gravada nunca tem o token.
 *
 * Uso (da raiz do repositório):
 *   node --import tsx apps/api/scripts/record-mapbox-fixtures.ts                      # usa MAPBOX_SERVER_TOKEN
 *   node --import tsx apps/api/scripts/record-mapbox-fixtures.ts --use-public-token   # usa EXPO_PUBLIC_MAPBOX_TOKEN do .env da raiz
 *
 * O segundo modo existe porque o token do SERVIDOR ainda não foi criado (o dono cria, V1 do plano). O token público serve
 * para a gravação pelo mesmo motivo que serviu à F10 (as APIs de busca e rota não exigem escopo secreto); a API em
 * produção NUNCA usa o token público. O token não é impresso nem gravado. ~210 chamadas, com 250 ms entre elas.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { DEFAULT_PROXIMITY, parseSearchQuery, roundNear, type LatLng } from '../src/domain/geo-search.js';
import { directionsUrl, forwardUrl, reverseUrl, urlWithoutToken, type ForwardEngine } from '../src/lib/mapbox.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(here, '../test/fixtures/mapbox');
const ROOT_ENV = path.resolve(here, '../../../.env');

/** A caixa da área "Grande Natal" semeada pela 0026 (o teste confere que o banco ainda tem esta). */
export const SEEDED_AREA_BBOX = [-35.42, -6.02, -35.12, -5.66] as const;

/** Rotas dos testes de cotação (nomes estáveis: os testes usam estes pontos). */
export const RECORDED_ROUTES: Readonly<Record<string, { origin: LatLng; destination: LatLng }>> = {
  midway_to_praia_shopping: { origin: { lat: -5.811, lng: -35.2065 }, destination: { lat: -5.871, lng: -35.1825 } },
  aeroporto_to_ponta_negra: { origin: { lat: -5.7686, lng: -35.3721 }, destination: { lat: -5.88, lng: -35.169 } },
  midway_short_hop: { origin: { lat: -5.811, lng: -35.2065 }, destination: { lat: -5.8112, lng: -35.2056 } },
};

/** Pinos dos testes do reverso. */
export const RECORDED_PINS: Readonly<Record<string, LatLng>> = {
  rua_mossoro: { lat: -5.7982, lng: -35.2034 },
  midway_mall: { lat: -5.811, lng: -35.2065 },
  mar_dentro_da_area: { lat: -5.85, lng: -35.13 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pick(source: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  if (!isRecord(source)) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
  return out;
}

/** Só o que o adaptador lê, mais a confiança (para a análise caso a caso da amostra). */
function trimFeatures(body: unknown): unknown {
  if (!isRecord(body) || !Array.isArray(body['features'])) return body;
  return {
    type: body['type'],
    features: (body['features'] as unknown[]).filter(isRecord).map((feature) => {
      const properties = isRecord(feature['properties']) ? feature['properties'] : {};
      const context = isRecord(properties['context']) ? properties['context'] : {};
      const trimmedContext: Record<string, unknown> = {};
      for (const key of ['neighborhood', 'locality', 'place', 'region', 'street', 'postcode']) {
        const entry = pick(context[key], ['name', 'region_code']);
        if (entry) trimmedContext[key] = entry;
      }
      return {
        type: 'Feature',
        ...(feature['id'] !== undefined ? { id: feature['id'] } : {}),
        geometry: pick(feature['geometry'], ['type', 'coordinates']),
        properties: {
          ...pick(properties, ['mapbox_id', 'feature_type', 'name', 'full_address', 'place_formatted', 'address']),
          coordinates: pick(properties['coordinates'], ['latitude', 'longitude']),
          context: trimmedContext,
          ...(isRecord(properties['match_code']) ? { match_code: pick(properties['match_code'], ['confidence']) } : {}),
        },
      };
    }),
  };
}

function trimDirections(body: unknown): unknown {
  if (!isRecord(body)) return body;
  const routes = Array.isArray(body['routes']) ? (body['routes'] as unknown[]).map((route) => pick(route, ['distance', 'duration', 'geometry'])) : undefined;
  return { code: body['code'], ...(routes ? { routes } : {}) };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const usePublic = process.argv.includes('--use-public-token');
  if (usePublic) loadEnv({ path: ROOT_ENV, quiet: true });
  const token = (usePublic ? process.env['EXPO_PUBLIC_MAPBOX_TOKEN'] : process.env['MAPBOX_SERVER_TOKEN'])?.trim();
  if (!token) {
    console.error(`[record] token ausente (${usePublic ? 'EXPO_PUBLIC_MAPBOX_TOKEN no .env da raiz' : 'MAPBOX_SERVER_TOKEN'}).`);
    process.exitCode = 1;
    return;
  }

  const { sample } = JSON.parse(readFileSync(path.join(FIXTURES, 'f10-sample.json'), 'utf8')) as { sample: { category: string; query: string }[] };
  const calls: { url: string; trim: (body: unknown) => unknown }[] = [];
  const proximity = roundNear(DEFAULT_PROXIMITY);
  for (const item of sample) {
    const parsed = parseSearchQuery({ q: item.query, kind: 'any' });
    if (!parsed) throw new Error(`consulta inválida na amostra: ${item.query}`);
    for (const engine of ['geocoding', 'searchbox'] as ForwardEngine[]) {
      calls.push({ url: forwardUrl(engine, { q: parsed.q, proximity, bbox: SEEDED_AREA_BBOX }, token), trim: trimFeatures });
    }
  }
  for (const route of Object.values(RECORDED_ROUTES)) {
    calls.push({ url: directionsUrl('driving-traffic', route.origin, route.destination, token), trim: trimDirections });
  }
  for (const pin of Object.values(RECORDED_PINS)) {
    const rounded = { lat: Math.round(pin.lat * 10_000) / 10_000, lng: Math.round(pin.lng * 10_000) / 10_000 };
    calls.push({ url: reverseUrl(rounded, token), trim: trimFeatures });
  }

  const responses: Record<string, { status: number; body: unknown }> = {};
  let failures = 0;
  for (const [index, call] of calls.entries()) {
    const key = urlWithoutToken(call.url);
    if (responses[key]) continue;
    let status = 0;
    let body: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(call.url, { signal: AbortSignal.timeout(10_000) });
        status = response.status;
        body = await response.json().catch(() => null);
        if (status !== 429 && status < 500) break;
      } catch {
        status = 0;
      }
      await sleep(500 * 2 ** (attempt - 1));
    }
    if (status !== 200) failures += 1;
    responses[key] = { status, body: call.trim(body) };
    if ((index + 1) % 20 === 0) console.log(`[record] ${index + 1}/${calls.length}`);
    await sleep(250);
  }

  const out = {
    note: 'Respostas REAIS do Mapbox, aparadas (scripts/record-mapbox-fixtures.ts). Chave = URL sem o token.',
    recordedAt: new Date().toISOString(),
    tokenKind: usePublic ? 'public (EXPO_PUBLIC_MAPBOX_TOKEN, como a F10)' : 'server (MAPBOX_SERVER_TOKEN)',
    responses,
  };
  writeFileSync(path.join(FIXTURES, 'recorded.local.json'), `${JSON.stringify(out)}\n`);
  console.log(`[record] ${Object.keys(responses).length} respostas gravadas, ${failures} com status diferente de 200.`);
}

void main();
