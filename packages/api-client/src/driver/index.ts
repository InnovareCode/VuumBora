/**
 * Portas do MOTORISTA. Nunca importar em apps/passenger.
 *
 *   const { offerPort, tripPort, control } = createMockDriverRidePort();
 *   const rideOffer = control.offer({ pickup, destination, categoryId, estimatedPayout });
 *   const accepted = await offerPort.accept(rideOffer, idempotencyKey);
 *   const cancelled = await tripPort.cancel(accepted.data.tripId, idempotencyKey); // ver README
 */
export type { DriverJourneyPort, DriverOfferPort, DriverTripPort } from './types';

export { createMockDriverRidePort } from './mock-adapter';
export type {
  MockDriverRide,
  MockDriverRideControl,
  MockDriverRideOptions,
  OfferInput,
} from './mock-adapter';
