/**
 * Portas do MOTORISTA. Nunca importar em apps/passenger.
 *
 *   const { offerPort, tripPort, journeyPort, locationPort, control } = createMockDriverRidePort();
 *   await journeyPort.setAvailability({ online: true, point });
 *   const rideOffer = control.offer({ pickup, destination, categoryId, estimatedPayout });
 *   const accepted = await offerPort.accept(rideOffer, idempotencyKey);
 *   const arrived = await tripPort.arrived(accepted.data.tripId, idempotencyKey); // ver README
 */
export type {
  DeclineReason,
  DriverAvailabilityInput,
  DriverCancelReason,
  DriverJourneyPort,
  DriverLocationPort,
  DriverOfferPort,
  DriverTripPort,
  DriverTripSnapshot,
  LocationFix,
  OfferEvent,
} from './types';

export { createMockDriverRidePort } from './mock-adapter';
export type {
  MockDriverRide,
  MockDriverRideControl,
  MockDriverRideOptions,
  OfferInput,
} from './mock-adapter';
