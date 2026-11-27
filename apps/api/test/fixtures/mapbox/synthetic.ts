/**
 * Respostas FICTÍCIAS do Mapbox para a suíte (M4, fatias G3/G4). NADA aqui veio do Mapbox: nomes, coordenadas, distâncias e
 * polilinhas foram INVENTADOS no formato das APIs (Geocoding v6, Search Box, Geocoding v6 reverso, Directions), só para
 * exercitar o adaptador, as rotas e a cotação. Por isso vão para o repositório (público) e rodam no CI.
 *
 * As respostas REAIS (amostra da F10) ficam fora do git, em `recorded.local.json` (decisão do Atlas, 27/11/2026: os termos da
 * geocodificação temporária restringem guardar resultados). Ver `scripts/record-mapbox-fixtures.ts`.
 *
 * Cada resposta é achada pela URL SEM o token, montada pelas MESMAS funções do adaptador (`forwardUrl`, `reverseUrl`,
 * `directionsUrl`): mudou um parâmetro na rota, a chave muda junto e o teste acusa "sem resposta" em vez de passar calado.
 * Parâmetros fixos: proximidade = centro de Natal arredondado (a rota sem `near`), caixa = a da área semeada pela 0026.
 */
import { DEFAULT_PROXIMITY, parseSearchQuery, roundNear, type LatLng } from '../../../src/domain/geo-search.js';
import { directionsUrl, forwardUrl, reverseUrl, urlWithoutToken, type ForwardEngine } from '../../../src/lib/mapbox.js';

export const FICTITIOUS_NOTICE = 'FICTÍCIO: resposta inventada no formato do Mapbox para teste; não veio do Mapbox.';

/** A caixa da área "Grande Natal" semeada pela 0026 (o teste das rotas confere que o banco tem esta). */
export const SYNTHETIC_AREA_BBOX = [-35.42, -6.02, -35.12, -5.66] as const;

/** Pontos das rotas fictícias da cotação (os testes usam estes). */
export const SYNTHETIC_ROUTES = {
  midwayToPraiaShopping: { origin: { lat: -5.811, lng: -35.2065 }, destination: { lat: -5.871, lng: -35.1825 }, distance: 8657.603, duration: 1285.755 },
  aeroportoToPontaNegra: { origin: { lat: -5.7686, lng: -35.3721 }, destination: { lat: -5.88, lng: -35.169 }, distance: 35089.402, duration: 3631.423 },
  midwayShortHop: { origin: { lat: -5.811, lng: -35.2065 }, destination: { lat: -5.8112, lng: -35.2056 }, distance: 97.185, duration: 26.871 },
} as const;

/** Pinos fictícios do reverso. */
export const SYNTHETIC_PINS = {
  /** Endereço inventado: "Rua Fictícia do Teste 100", no "Bairro Fictício". */
  named: { lat: -5.7982, lng: -35.2034 },
  /** No mar (a leste da Via Costeira): só estado e país, sem nome útil. */
  sea: { lat: -5.85, lng: -35.13 },
} as const;

export const SYNTHETIC_PIN_LABEL = 'Rua Fictícia do Teste 100 - Bairro Fictício';

const TOKEN = 'pk.ficticio.ficticio';
let counter = 0;

interface Place { readonly name: string; readonly lat: number; readonly lng: number; readonly neighborhood?: string; readonly city?: string; readonly street?: string }

function context(place: Place) {
  return {
    ...(place.neighborhood ? { neighborhood: { name: place.neighborhood } } : {}),
    place: { name: place.city ?? 'Natal' },
    region: { name: 'Rio Grande do Norte', region_code: 'RN' },
  };
}

function geocodingFeature(place: Place, featureType = 'address') {
  const id = `ficticio-gc-${++counter}`;
  return {
    type: 'Feature',
    id,
    geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
    properties: {
      mapbox_id: id,
      feature_type: featureType,
      name: place.name,
      full_address: `${place.name}, ${place.neighborhood ?? ''}, ${place.city ?? 'Natal'} - Rio Grande do Norte, Brasil`,
      place_formatted: `${place.city ?? 'Natal'} - Rio Grande do Norte, Brasil`,
      coordinates: { latitude: place.lat, longitude: place.lng },
      context: context(place),
    },
  };
}

function searchBoxFeature(place: Place) {
  const id = `ficticio-sb-${++counter}`;
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [place.lng, place.lat] },
    properties: {
      mapbox_id: id,
      feature_type: 'poi',
      name: place.name,
      ...(place.street ? { address: place.street } : {}),
      full_address: `${place.street ?? ''}, ${place.city ?? 'Natal'}, Brasil`,
      place_formatted: `${place.city ?? 'Natal'}, Brasil`,
      coordinates: { latitude: place.lat, longitude: place.lng },
      context: context(place),
    },
  };
}

const collection = (features: unknown[]) => ({ type: 'FeatureCollection', features, attribution: FICTITIOUS_NOTICE });

/** Polilinha codificada, precisão 5 (o algoritmo da Google/Mapbox), de uma linha reta fatiada em `steps` pontos. */
function straightPolyline(from: LatLng, to: LatLng, steps: number): string {
  const encodeValue = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let out = '';
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return out + String.fromCharCode(v + 63);
  };
  let previous = { lat: 0, lng: 0 };
  let encoded = '';
  for (let i = 0; i <= steps; i++) {
    const lat = Math.round((from.lat + ((to.lat - from.lat) * i) / steps) * 1e5);
    // Um "zigue-zague" leve para a polilinha não ser só uma reta (fictícia de qualquer jeito).
    const lng = Math.round((from.lng + ((to.lng - from.lng) * i) / steps) * 1e5) + (i % 2 === 0 ? 0 : 7);
    encoded += encodeValue(lat - previous.lat) + encodeValue(lng - previous.lng);
    previous = { lat, lng };
  }
  return encoded;
}

type Responses = Record<string, { readonly status: number; readonly body: unknown }>;

function build(): Responses {
  const responses: Responses = {};
  const proximity = roundNear(DEFAULT_PROXIMITY);
  const forward = (raw: string, engine: ForwardEngine, features: unknown[]) => {
    const parsed = parseSearchQuery({ q: raw, kind: 'any' });
    if (!parsed) throw new Error(`consulta fictícia inválida: ${raw}`);
    responses[urlWithoutToken(forwardUrl(engine, { q: parsed.q, proximity, bbox: SYNTHETIC_AREA_BBOX }, TOKEN))] = { status: 200, body: collection(features) };
  };

  // Busca (rotas de geografia). Coordenadas inventadas, todas dentro da caixa da área.
  forward('midway mall natal', 'geocoding', []);
  forward('midway mall natal', 'searchbox', [searchBoxFeature({ name: 'Midway Mall', lat: -5.8112, lng: -35.2061, neighborhood: 'Tirol', street: 'Av. Fictícia, 1' })]);
  forward('Midway Mall, Av. Rio Branco, 536, Petrópolis, Natal, RN', 'geocoding', [geocodingFeature({ name: 'Avenida Rio Branco 536', lat: -5.7921, lng: -35.2049, neighborhood: 'Petrópolis' })]);
  forward('Midway Mall, Av. Rio Branco, 536, Petrópolis, Natal, RN', 'searchbox', [searchBoxFeature({ name: 'Midway Mall', lat: -5.8112, lng: -35.2061, neighborhood: 'Tirol', street: 'Av. Fictícia, 1' })]);
  forward('Rua Potengi, 300, Tirol, Natal, RN', 'geocoding', [
    geocodingFeature({ name: 'Rua Potengi 300', lat: -5.7835, lng: -35.2023, neighborhood: 'Petrópolis' }),
    geocodingFeature({ name: 'Tirol', lat: -5.7975, lng: -35.2005, neighborhood: 'Tirol' }, 'neighborhood'),
  ]);
  forward('R. Potengi 300 Tirol Natal RN', 'geocoding', [geocodingFeature({ name: 'Rua Potengi 300', lat: -5.7835, lng: -35.2023, neighborhood: 'Petrópolis' })]);
  forward('Hospital do Coracao Natal', 'searchbox', [searchBoxFeature({ name: 'Hospital do Coração', lat: -5.827, lng: -35.21, neighborhood: 'Lagoa Nova', street: 'Rua Fictícia, 10' })]);
  forward('Av. Hermes da Fonseca, 721, Tirol, Natal, RN', 'geocoding', [geocodingFeature({ name: 'Avenida Hermes da Fonseca 721', lat: -5.8001, lng: -35.2017, neighborhood: 'Tirol' })]);
  forward('Av. Hermes da Fonseca, 721, Tirol, Natal, RN', 'searchbox', []);
  forward('Rua Mossoró, 480, Petrópolis, Natal, RN', 'geocoding', [geocodingFeature({ name: 'Rua Mossoró 480', lat: -5.7978, lng: -35.2031, neighborhood: 'Petrópolis' })]);
  forward('Rua Mossoró, 480, Petrópolis, Natal, RN', 'searchbox', []);
  forward('Rua Chile, 50, Cidade Alta, Natal, RN', 'geocoding', [geocodingFeature({ name: 'Rua Chile 50', lat: -5.7745, lng: -35.2051, neighborhood: 'Ribeira' })]);
  forward('Via Costeira Natal', 'geocoding', [geocodingFeature({ name: 'Via Costeira', lat: -5.8455, lng: -35.1772 }, 'street')]);
  forward('Via Costeira Natal', 'searchbox', []);

  // Pino.
  const named = SYNTHETIC_PINS.named;
  responses[urlWithoutToken(reverseUrl(named, TOKEN))] = {
    status: 200,
    body: collection([
      geocodingFeature({ name: 'Rua Fictícia do Teste 100', lat: named.lat, lng: named.lng, neighborhood: 'Bairro Fictício' }),
      geocodingFeature({ name: 'Bairro Fictício', lat: named.lat, lng: named.lng, neighborhood: 'Bairro Fictício' }, 'neighborhood'),
      geocodingFeature({ name: 'Natal', lat: named.lat, lng: named.lng }, 'place'),
    ]),
  };
  const sea = SYNTHETIC_PINS.sea;
  responses[urlWithoutToken(reverseUrl(sea, TOKEN))] = {
    status: 200,
    body: collection([geocodingFeature({ name: 'Rio Grande do Norte', lat: sea.lat, lng: sea.lng }, 'region'), geocodingFeature({ name: 'Brasil', lat: sea.lat, lng: sea.lng }, 'country')]),
  };

  // Rotas (Directions, perfil padrão driving-traffic).
  for (const route of Object.values(SYNTHETIC_ROUTES)) {
    responses[urlWithoutToken(directionsUrl('driving-traffic', route.origin, route.destination, TOKEN))] = {
      status: 200,
      body: {
        code: 'Ok',
        routes: [{ distance: route.distance, duration: route.duration, geometry: straightPolyline(route.origin, route.destination, 40) }],
        attribution: FICTITIOUS_NOTICE,
      },
    };
  }
  return responses;
}

export const SYNTHETIC_RESPONSES: Readonly<Responses> = build();
