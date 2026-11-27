/**
 * Ponto-no-polígono da área de serviço (M4, N7: sem PostGIS). A regra decide `422
 * outside_service_area` e o `inServiceArea` do pino; borda conta como dentro, buraco não.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  assertValidPolygon,
  isPointInBoundingBox,
  isPointInPolygon,
  isPointInServiceArea,
  type BoundingBox,
  type GeoJsonPolygon,
} from '../src/service-area';

/** Um "C" (côncavo): a reentrância à direita fica DENTRO da caixa e FORA do polígono. */
const C_SHAPE: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 3],
      [3, 3],
      [3, 7],
      [10, 7],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
};
const C_BBOX: BoundingBox = [0, 0, 10, 10];

const SQUARE_WITH_HOLE: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ],
  ],
};

const at = (longitude: number, latitude: number) => ({ latitude, longitude });

describe('isPointInPolygon', () => {
  test('dentro e fora do contorno', () => {
    assert.equal(isPointInPolygon(at(1, 1), C_SHAPE), true);
    assert.equal(isPointInPolygon(at(11, 5), C_SHAPE), false);
    assert.equal(isPointInPolygon(at(-0.5, 5), C_SHAPE), false);
  });

  test('côncavo: a reentrância está na caixa mas fora do polígono', () => {
    assert.equal(isPointInBoundingBox(at(6, 5), C_BBOX), true);
    assert.equal(isPointInPolygon(at(6, 5), C_SHAPE), false);
    assert.equal(isPointInServiceArea(at(6, 5), { polygon: C_SHAPE, bbox: C_BBOX }), false);
  });

  test('borda e vértice contam como dentro', () => {
    assert.equal(isPointInPolygon(at(5, 0), C_SHAPE), true, 'sobre a aresta de baixo');
    assert.equal(isPointInPolygon(at(3, 5), C_SHAPE), true, 'sobre a aresta da reentrância');
    assert.equal(isPointInPolygon(at(10, 10), C_SHAPE), true, 'no vértice');
  });

  test('buraco: dentro dele é fora; na linha dele ainda é dentro', () => {
    assert.equal(isPointInPolygon(at(5, 5), SQUARE_WITH_HOLE), false);
    assert.equal(isPointInPolygon(at(2, 2), SQUARE_WITH_HOLE), true);
    assert.equal(isPointInPolygon(at(4, 5), SQUARE_WITH_HOLE), true);
  });

  test('ordem GeoJSON: [longitude, latitude] (trocar as duas muda a resposta)', () => {
    const tall: GeoJsonPolygon = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 10], [0, 10], [0, 0]]] };
    assert.equal(isPointInPolygon({ longitude: 0.5, latitude: 8 }, tall), true);
    assert.equal(isPointInPolygon({ longitude: 8, latitude: 0.5 }, tall), false);
  });

  test('coordenadas reais de Natal (números negativos, várias casas)', () => {
    const natal: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [[[-35.3, -5.95], [-35.15, -5.95], [-35.15, -5.7], [-35.3, -5.7], [-35.3, -5.95]]],
    };
    assert.equal(isPointInPolygon({ latitude: -5.8341, longitude: -35.2112 }, natal), true);
    assert.equal(isPointInPolygon({ latitude: -5.7683, longitude: -35.3761 }, natal), false);
  });
});

describe('validação estrita (lança, não responde "fora")', () => {
  test('anel aberto, curto ou sem contorno', () => {
    assert.throws(() => assertValidPolygon({ type: 'Polygon', coordinates: [] }), RangeError);
    assert.throws(() => assertValidPolygon({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 0]]] }), RangeError);
    assert.throws(
      () => assertValidPolygon({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] }),
      /não é fechado/,
    );
  });

  test('coordenada fora do intervalo ou não finita', () => {
    assert.throws(
      () => assertValidPolygon({ type: 'Polygon', coordinates: [[[0, 0], [200, 0], [1, 1], [0, 0]]] }),
      RangeError,
    );
    assert.throws(() => isPointInPolygon({ latitude: Number.NaN, longitude: 0 }, C_SHAPE), RangeError);
    assert.throws(() => isPointInBoundingBox({ latitude: 0, longitude: Infinity }, C_BBOX), RangeError);
  });
});
