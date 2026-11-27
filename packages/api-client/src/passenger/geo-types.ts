/**
 * Contrato de GEOGRAFIA E COTAÇÃO do passageiro (M4, fatia K0 do `docs/plano-m3-m4.md` §3). Telas:
 * P03 (área e mapa), P04 (busca + pino), P05 (categorias e preço), P06 (confirmação com o selo "tarifa
 * de teste"). A busca é PELO SERVIDOR (N6): o token secreto do Mapbox nunca entra no app.
 *
 * Os nomes de campo seguem o §3 ao pé da letra (`lat`/`lng`, não o `GeoPoint` do domínio): o adaptador
 * `http` repassa o corpo sem traduzir.
 *
 * **Convivência com a F08:** `PassengerRidePort.quote()` (forma antiga, `Quote.categories[]`) continua
 * existindo porque `request()` ainda consome o `quoteId` dela até o M5. A cotação do M4 é
 * `FareQuotePort.createQuotes()`; a P05 migra para ela no G6.
 */
import type { ServiceArea } from '@vuumbora/domain';
import type { Result } from '../index';
import type { ErrorCatalog } from '../server-error';

export type { ServiceArea };

export type GeoSearchKind = 'address' | 'place';

/** De onde veio o resultado. `curated` = pontos próprios (`curated_places`), sempre primeiro. */
export type GeoSearchSource = 'curated' | 'geocoding' | 'searchbox';

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/** `GET /v1/geo/search?q&kind&near`. */
export interface GeoSearchInput {
  /** Texto digitado. Menos de 2 caracteres (sem contar espaços) responde lista vazia, sem erro; mais de 100 é `400 invalid_body`. */
  readonly q: string;
  /** Padrão `address`. */
  readonly kind?: GeoSearchKind;
  /** Desempate por proximidade (ex.: a posição do passageiro). */
  readonly near?: LatLng;
}

export interface GeoSearchResult {
  readonly id: string;
  readonly label: string;
  readonly sublabel: string;
  readonly lat: number;
  readonly lng: number;
  readonly source: GeoSearchSource;
}

/** `GET /v1/geo/reverse?lat&lng` (o pino). O pino SEMPRE pede confirmação na tela (N6), mesmo com rótulo. */
export interface ReverseGeocodeResult {
  readonly label: string;
  readonly lat: number;
  readonly lng: number;
  readonly inServiceArea: boolean;
}

/** `GET /v1/categories`: só as LIGADAS (Motorista mulher, Pet e Entrega desligadas, D-08/D-09). */
export interface RideCategory {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly seats: number;
}

export interface GeoPort {
  /** Pontos próprios primeiro, até 8 resultados. `400 invalid_body` · `429 rate_limited` · `502 geo_unavailable` (acréscimo ao §3). */
  search(input: GeoSearchInput): Promise<Result<{ readonly results: readonly GeoSearchResult[] }>>;
  /** `400 invalid_body` (coordenada fora do intervalo) · `429 rate_limited` · `502 geo_unavailable`. Fora da área NÃO é erro: `inServiceArea: false`. */
  reverse(point: LatLng): Promise<Result<ReverseGeocodeResult>>;
  /** A área vigente (polígono GeoJSON `[lng, lat]` + `bbox`). Regra do ponto: `isPointInServiceArea`, `@vuumbora/domain`. */
  serviceArea(): Promise<Result<ServiceArea>>;
  categories(): Promise<Result<readonly RideCategory[]>>;
}

/** Ponto da cotação: coordenada + o texto que o passageiro confirmou. */
export interface QuotePoint extends LatLng {
  /** 1 a 200 caracteres. */
  readonly label: string;
}

/** `POST /v1/quotes`. */
export interface FareQuoteInput {
  readonly origin: QuotePoint;
  readonly destination: QuotePoint;
  /** Só estas categorias. Desconhecida ou desligada é ignorada (não é erro); sem nenhuma restante, `quotes: []`. */
  readonly categorySlugs?: readonly string[];
}

export interface QuoteRoute {
  readonly distanceM: number;
  readonly durationS: number;
  /** Polilinha codificada, precisão 5 (`decodePolyline`, `@vuumbora/domain`). */
  readonly polyline: string;
}

/**
 * Uma cotação por categoria, ASSINADA e com preço FECHADO por 5 min (N9, D-06). `signature` é opaca
 * para o app: ele só a devolve no pedido (M5), nunca confere nem monta.
 */
export interface FareQuote {
  readonly quoteId: string;
  readonly categorySlug: string;
  readonly priceCents: number;
  readonly currency: 'BRL';
  readonly fareVersionId: string;
  /** `true` = tarifa de teste: a P06 mostra o selo. Em produção nunca chega `true` (N8). */
  readonly isTestFare: boolean;
  /** ISO 8601. Depois disso, `409 quote_expired` (`isQuoteExpired`, `@vuumbora/domain`). */
  readonly expiresAt: string;
  readonly signature: string;
}

export interface FareQuoteResult {
  readonly route: QuoteRoute;
  readonly quotes: readonly FareQuote[];
}

export interface FareQuotePort {
  /**
   * Ordem: `400 invalid_body` → `503 fare_not_configured` (produção só com tarifa de teste, N8) →
   * `422 outside_service_area` (origem ou destino) → `502 route_unavailable` (Directions falhou) →
   * `422 route_too_short`. Mais `429 rate_limited`.
   */
  createQuotes(input: FareQuoteInput): Promise<Result<FareQuoteResult>>;
  /** `404 not_found` (inexistente ou de outra conta) · `409 quote_expired`. A mesma checagem vale no `POST /v1/trips` (M5). */
  getQuote(quoteId: string): Promise<Result<FareQuote>>;
}

/** Catálogo FECHADO dos `code` de geografia e cotação. */
export const GEO_QUOTE_ERRORS = {
  invalid_body: { status: 400, message: 'Dados inválidos.' },
  unauthorized: { status: 401, message: 'Sessão expirada.' },
  not_found: { status: 404, message: 'Cotação não encontrada.' },
  quote_expired: { status: 409, message: 'O preço venceu. Calcule de novo.' },
  outside_service_area: { status: 422, message: 'Ainda não atendemos este trajeto.' },
  route_too_short: { status: 422, message: 'O destino está muito perto da origem.' },
  rate_limited: { status: 429, message: 'Muitas buscas seguidas. Aguarde um pouco.' },
  route_unavailable: { status: 502, message: 'Não conseguimos calcular a rota agora.' },
  geo_unavailable: { status: 502, message: 'Não conseguimos buscar endereços agora.' },
  fare_not_configured: { status: 503, message: 'As corridas ainda não estão disponíveis.' },
} as const satisfies ErrorCatalog;

export type GeoQuoteErrorCode = keyof typeof GEO_QUOTE_ERRORS;
