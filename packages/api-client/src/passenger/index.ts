/**
 * Portas do PASSAGEIRO. Nunca importar em apps/driver.
 *
 *   const { port, control } = createMockPassengerRidePort();
 *   const quoted = await port.quote(draft);
 *   const requested = await port.request({ quoteId, categoryId, paymentMethodId }, idempotencyKey);
 *   const unsubscribe = port.subscribe(tripId, onEvent);
 *   control.advance(tripId, 'driver_assigned', { driverId, firstName, plate }); // ver README
 */
export type {
  CategoryAvailability,
  CategoryQuote,
  PassengerRidePort,
  PlacesPort,
  Quote,
  RequestRideInput,
} from './types';

export { createMockPassengerRidePort } from './mock-adapter';
export type { MockPassengerRide, MockPassengerRideControl, MockPassengerRideOptions } from './mock-adapter';
