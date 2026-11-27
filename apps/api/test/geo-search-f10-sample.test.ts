/**
 * Aceite da G3 (`docs/plano-m3-m4.md` §4): a amostra da F10 (100 endereços de Natal) pela ROTA NOVA, `GET /v1/geo/search`
 * com `kind=any` (uma chamada por busca), sobre as respostas REAIS do Mapbox gravadas (`test/fixtures/mapbox/recorded.local.json`,
 * só na máquina de quem gravou; sem ela o teste PULA)
 * e os pontos próprios do banco (semente da 0026). Régua: o critério (A) da F10, aplicado ao PRIMEIRO resultado
 * (`helpers/f10-evaluation.ts`). Meta: >= 90%, ou a diferença listada caso a caso.
 *
 * O teste imprime a tabela por categoria e cada caso que falhou (consulta, primeiro resultado, motivo) e trava o número
 * medido como piso: uma mudança na ordem que piore a amostra derruba o teste. As respostas são de 27/11/2026: regravar
 * (scripts/record-mapbox-fixtures.ts) pode mudar o número, e aí o piso é revisto com a lista nova.
 *
 * A RÉGUA É FROUXA (achado da G3): aceita resultado que divide UMA palavra com a rua pedida ("Rua Teixeira de Freitas" →
 * "Rua Freitas", outro bairro, conta como acerto). Por isso este número não basta: o que a régua não vê está travado em
 * `geo-search-ranking.test.ts`, e os falsos positivos/negativos conhecidos estão no relatório da G3.
 */
import './helpers/auth-env.js';
import './helpers/runtime-role-env.js';
import './helpers/setup.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadActiveServiceArea } from '../src/repositories/geo-repository.js';
import type { ServiceArea } from '../src/domain/geo-fare-rules.js';
import type { GeoSearchResult } from '../src/domain/geo-search.js';
import { prepararBanco } from '../src/migrate.js';
import { evaluateTopResult, type F10Verdict } from './helpers/f10-evaluation.js';
import { shutdown } from './helpers/harness.js';
import { FakeMailbox, makeClient, randomIp, uniqueEmail } from './helpers/identity-kit.js';
import { ensureBaseline } from './helpers/legal-kit.js';
import { FIXTURES_DIR, hasLocalRecording, replayFetch, replayProvider, testGeoConfig } from './helpers/mapbox-replay.js';
import { OWNER_DATABASE_URL } from './helpers/runtime-role-env.js';

/** Piso medido em 27/11/2026 com as respostas gravadas nesse dia (ver o relatório impresso pelo teste). */
const MEASURED_FLOOR = 92;

const owner = new pg.Pool({ connectionString: OWNER_DATABASE_URL, max: 2 });
const mailbox = new FakeMailbox();
let app: FastifyInstance;
let token = '';
let area: ServiceArea;

const { sample } = JSON.parse(readFileSync(path.join(FIXTURES_DIR, 'f10-sample.json'), 'utf8')) as { sample: { category: string; query: string }[] };

/**
 * Sem a gravação REAL local (`test/fixtures/mapbox/recorded.local.json`, fora do git: repositório público e termos da
 * geocodificação temporária), a amostra não tem o que medir: o teste PULA, com o motivo, em vez de quebrar o CI. Para medir:
 * `node --import tsx scripts/record-mapbox-fixtures.ts --use-public-token` (ou com MAPBOX_SERVER_TOKEN) e rodar de novo.
 */
const SKIP = hasLocalRecording()
  ? false
  : 'sem test/fixtures/mapbox/recorded.local.json (respostas reais do Mapbox ficam fora do git); grave com scripts/record-mapbox-fixtures.ts para medir a amostra da F10';

describe('amostra da F10 pela rota nova (kind=any, respostas gravadas)', { skip: SKIP }, () => {
  before(async () => {
    await prepararBanco({ databaseUrl: OWNER_DATABASE_URL, pool: owner, log: () => undefined });
    await ensureBaseline(owner);
    const replay = replayFetch('local');
    app = await buildApp({ logStream: new Writable({ write: (_chunk, _encoding, callback) => callback() }), mail: mailbox, geo: { config: testGeoConfig(), provider: replayProvider(replay) } });
    await app.ready();
    const session = await makeClient({ t: { app, logs: () => '' }, mailbox }).registerAndLogin(uniqueEmail('passageiro'), 'passenger');
    token = session.accessToken;
    const loaded = await loadActiveServiceArea(owner, 'natal');
    assert.ok(loaded, 'a 0026 semeia a área de Natal');
    area = loaded;
  });

  after(async () => {
    await app.close();
    await owner.end();
    await shutdown();
  });

  test('a caixa da área no banco é a das gravações (senão as URLs mudaram: regrave)', () => {
    assert.deepEqual([...area.bbox], [-35.42, -6.02, -35.12, -5.66]);
  });

  test(`>= ${MEASURED_FLOOR}% localizados corretamente (critério A da F10, primeiro resultado)`, async () => {
    const rows: { category: string; query: string; verdict: F10Verdict; top?: GeoSearchResult }[] = [];
    for (const item of sample) {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/geo/search?${new URLSearchParams({ q: item.query, kind: 'any' }).toString()}`,
        headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': randomIp() },
      });
      assert.equal(response.statusCode, 200, `${item.query}: ${response.body}`);
      const results = (JSON.parse(response.body) as { data: { results: GeoSearchResult[] } }).data.results;
      const top = results[0];
      rows.push({ category: item.category, query: item.query, verdict: evaluateTopResult(item.query, top, area), ...(top ? { top } : {}) });
    }

    const hits = rows.filter((row) => row.verdict === 'ok').length;
    const byCategory = new Map<string, { total: number; hits: number; curated: number }>();
    for (const row of rows) {
      const stat = byCategory.get(row.category) ?? { total: 0, hits: 0, curated: 0 };
      stat.total += 1;
      if (row.verdict === 'ok') stat.hits += 1;
      if (row.top?.source === 'curated') stat.curated += 1;
      byCategory.set(row.category, stat);
    }
    const report = [
      `F10 pela rota nova: ${hits}/${rows.length} (${hits}%)`,
      ...[...byCategory].map(([category, stat]) => `  ${category}: ${stat.hits}/${stat.total} (ponto próprio no topo: ${stat.curated})`),
      'Casos que falharam:',
      ...rows
        .filter((row) => row.verdict !== 'ok')
        .map((row) => `  [${row.verdict}] (${row.category}) "${row.query}" -> ${row.top ? `${row.top.source}: ${row.top.label} | ${row.top.sublabel}` : '(nada)'}`),
    ].join('\n');
    console.log(report);
    assert.ok(hits >= MEASURED_FLOOR, report);
  });
});
