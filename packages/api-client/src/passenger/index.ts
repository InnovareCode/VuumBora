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
  PassengerTripSnapshot,
  PlacesPort,
  Quote,
  QuoteInput,
  RequestRideInput,
  TripDriverSummary,
} from './types';

export { createMockPassengerRidePort } from './mock-adapter';
export type { MockPassengerRide, MockPassengerRideControl, MockPassengerRideOptions } from './mock-adapter';
