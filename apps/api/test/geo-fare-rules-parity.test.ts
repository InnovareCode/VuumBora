/**
 * As regras puras do servidor (`src/domain/geo-fare-rules.ts`) são CÓPIA das de `@vuumbora/domain` (a API é standalone: o
 * Dockerfile só copia `apps/api`). Este teste carrega o módulo do domínio em tempo de execução (caminho calculado, fora do
 * `rootDir` do typecheck de propósito) e compara as duas em milhares de casos sorteados: divergiu, cai.
 *
 * Cobre `computeFare` (G2: preço da cotação) e `isPointInServiceArea` (N7: `outside_service_area` e `inServiceArea`), mais
 * as constantes que o app e o servidor precisam ter iguais (validade de 5 min).
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, test } from 'node:test';
import * as server from '../src/domain/geo-fare-rules.js';

interface DomainModule {
  computeFare(rates: server.FareRates, input: { distanceM: number; durationS: number; dynamicMultiplier?: number }): server.FareComputation;
  isPointInServiceArea(point: { latitude: number; longitude: number }, area: Pick<server.ServiceArea, 'polygon' | 'bbox'>): boolean;
  QUOTE_TTL_SECONDS: number;
  isFareVersionQuotable(version: { isTest: boolean }, options: { allowTestFares: boolean }): boolean;
}

const DOMAIN_INDEX = path.resolve(import.meta.dirname, '../../../packages/domain/src/index.ts');
const domain = (await import(pathToFileURL(DOMAIN_INDEX).href)) as DomainModule;

let seed = 7;
function next(max: number): number {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return seed % (max + 1);
}

/** A área semeada pela 0026 (Grande Natal), com um buraco inventado para cobrir a regra do buraco. */
const AREA: Pick<server.ServiceArea, 'polygon' | 'bbox'> = {
  polygon: {
    type: 'Polygon',
    coordinates: [
      [[-35.42, -5.7], [-35.42, -5.82], [-35.37, -5.88], [-35.3, -5.97], [-35.2, -6.0], [-35.12, -6.02], [-35.13, -5.9], [-35.15, -5.8], [-35.18, -5.74], [-35.2, -5.66], [-35.32, -5.66], [-35.42, -5.7]],
      [[-35.3, -5.85], [-35.25, -5.85], [-35.25, -5.8], [-35.3, -5.8], [-35.3, -5.85]],
    ],
  },
  bbox: [-35.42, -6.02, -35.12, -5.66],
};

describe('paridade servidor x @vuumbora/domain', () => {
  test('computeFare: 20.000 casos sorteados, mesmo resultado (inclusive dinâmica e mínimo)', () => {
    for (let i = 0; i < 20_000; i++) {
      const rates = { baseCents: next(3000), perKmCents: next(800), perMinuteCents: next(200), minimumFareCents: next(5000) };
      const input = { distanceM: next(120_000), durationS: next(14_400), dynamicMultiplier: (100 + next(400)) / 100 };
      assert.deepEqual(server.computeFare(rates, input), domain.computeFare(rates, input), `caso ${i}: ${JSON.stringify({ rates, input })}`);
    }
  });

  test('computeFare: as duas recusam a mesma entrada inválida', () => {
    const rates = { baseCents: 400, perKmCents: 150, perMinuteCents: 25, minimumFareCents: 800 };
    for (const input of [{ distanceM: 1.5, durationS: 10 }, { distanceM: -1, durationS: 10 }, { distanceM: 10, durationS: 10, dynamicMultiplier: 0.9 }, { distanceM: 10, durationS: 10, dynamicMultiplier: 1.234 }]) {
      assert.throws(() => server.computeFare(rates, input), RangeError);
      assert.throws(() => domain.computeFare(rates, input), RangeError);
    }
  });

  test('isPointInServiceArea: 20.000 pontos sorteados na caixa e em volta, mais vértices e bordas', () => {
    const points: { lat: number; lng: number }[] = [];
    for (let i = 0; i < 20_000; i++) points.push({ lat: -6.1 + next(50_000) / 100_000, lng: -35.5 + next(45_000) / 100_000 });
    for (const ring of AREA.polygon.coordinates) {
      for (let i = 0; i < ring.length - 1; i++) {
        const [aLng, aLat] = ring[i]!;
        const [bLng, bLat] = ring[i + 1]!;
        points.push({ lat: aLat, lng: aLng }, { lat: (aLat + bLat) / 2, lng: (aLng + bLng) / 2 });
      }
    }
    for (const point of points) {
      assert.equal(server.isPointInServiceArea(point, AREA), domain.isPointInServiceArea({ latitude: point.lat, longitude: point.lng }, AREA), JSON.stringify(point));
    }
  });

  test('constantes e a trava da tarifa de teste (N8)', () => {
    assert.equal(server.QUOTE_TTL_SECONDS, domain.QUOTE_TTL_SECONDS);
    for (const isTest of [true, false]) {
      for (const allowTestFares of [true, false]) {
        assert.equal(server.isFareVersionQuotable({ isTest }, { allowTestFares }), domain.isFareVersionQuotable({ isTest }, { allowTestFares }));
      }
    }
  });
});
