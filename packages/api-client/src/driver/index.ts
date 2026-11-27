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
  DriverStartTripInput,
  DriverTripHistoryEntry,
  DriverTripHistoryInput,
  DriverTripHistoryPort,
  DriverTripPort,
  DriverTripSnapshot,
  LocationFix,
  OfferEvent,
} from './types';

/** M3 (fatia K0 do `docs/plano-m3-m4.md`): vínculo, etapa 2, veículo, verificação e documentos. */
export { DRIVER_ONBOARDING_ERRORS } from './onboarding-types';
export type {
  DocumentUploadPort,
  DocumentUploadRequest,
  DocumentUploadTarget,
  DriverOnboardingErrorCode,
  DriverOnboardingInput,
  DriverOnboardingPort,
  DriverVerification,
  LinkApplicationResult,
  UploadSource,
} from './onboarding-types';
export type {
  CnhCategory,
  DocumentRejection,
  DocumentRequirement,
  DriverAddress,
  DriverCnh,
  DriverDocumentSummary,
  DriverVehicleInput,
} from '../documents/types';
export { createMockDriverOnboarding } from './onboarding-mock-adapter';
export type { MockDriverOnboarding, MockDriverOnboardingControl, MockDriverOnboardingOptions, MockReviewDecision } from './onboarding-mock-adapter';
export { createDocumentStore } from '../documents/mock-store';
export type { DocumentStore, DocumentStoreOptions } from '../documents/mock-store';

export { createMockDriverRidePort } from './mock-adapter';
export type {
  MockDriverRide,
  MockDriverRideControl,
  MockDriverRideOptions,
  OfferInput,
} from './mock-adapter';
