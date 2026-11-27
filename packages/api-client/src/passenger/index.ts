/**
 * Portas do PASSAGEIRO. Nunca importar em apps/driver.
 *
 *   const { port, control } = createMockPassengerRidePort();
 *   const quoted = await port.quote({ origin, destination });
 *   const requested = await port.request({ quoteId, paymentMethodId }, idempotencyKey);
 *   const unsubscribe = port.subscribe(tripId, onEvent);
 *   control.advance(tripId, 'searching_driver'); // ver README
 */
export type {
  CancelReason,
  CategoryAvailability,
  CategoryQuote,
  PassengerRidePort,
  PassengerTripHistoryEntry,
  PassengerTripHistoryInput,
  PassengerTripSnapshot,
  PlacesPort,
  Quote,
  QuoteInput,
  RequestRideInput,
  TripDriverSummary,
} from './types';

export { createMockPassengerRidePort } from './mock-adapter';
export type { MockPassengerRide, MockPassengerRideControl, MockPassengerRideOptions } from './mock-adapter';

export { createMockPlacesPort } from './places-mock-adapter';
export type { MockPlacesOptions } from './places-mock-adapter';

/** M4 (fatia K0 do `docs/plano-m3-m4.md`): busca pelo servidor, área, categorias e cotação assinada. */
export { GEO_QUOTE_ERRORS } from './geo-types';
export type {
  FareQuote,
  FareQuoteInput,
  FareQuotePort,
  FareQuoteResult,
  GeoPort,
  GeoQuoteErrorCode,
  GeoSearchInput,
  GeoSearchKind,
  GeoSearchResult,
  GeoSearchSource,
  LatLng,
  QuotePoint,
  QuoteRoute,
  ReverseGeocodeResult,
  RideCategory,
  ServiceArea,
} from './geo-types';
export { createMockPassengerGeo, MOCK_GEO_PLACES } from './geo-mock-adapter';
export type { MockFareVersion, MockGeoPlace, MockPassengerGeo, MockPassengerGeoControl, MockPassengerGeoOptions } from './geo-mock-adapter';
export { MOCK_RIDE_CATEGORIES, MOCK_SERVICE_AREA, MOCK_TEST_FARE_VERSION } from '../geo/mock-data';
export type { MockRideCategory } from '../geo/mock-data';
