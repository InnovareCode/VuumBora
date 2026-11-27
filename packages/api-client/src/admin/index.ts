/**
 * `@vuumbora/api-client/admin` — contrato do PAINEL para o M3 (fila de documentos) e o M4 (tarifa e
 * área), fatia K0 do `docs/plano-m3-m4.md`. Sem DOM e sem React Native.
 *
 *   const { port, control } = createMockDocumentReview({ role: 'revisor_documentos' });
 *   const page = await port.queue();                       // mais antigo primeiro
 *   const link = await port.viewUrl(documentId);            // auditado (N5), vale 300 s
 *   await port.approve(documentId, { expiresOn }, key);     // N4: pode aprovar a conta
 */
export {
  DOCUMENT_REVIEW_ERRORS,
  DOCUMENT_REVIEW_ROLES,
  FARE_ADMIN_ERRORS,
  FARE_ADMIN_ROLES,
  canManageFares,
  canReviewDocuments,
} from './types';
export type {
  AdminDriverDetail,
  AdminDriverDocument,
  AdminRole,
  ApproveDocumentInput,
  BoundingBox,
  CategoryFareRates,
  DocumentDecision,
  DocumentReviewErrorCode,
  DocumentReviewPort,
  DocumentReviewQueueInput,
  DocumentReviewQueueItem,
  DocumentViewUrl,
  DriverReinstatement,
  DriverReinstatementPort,
  DriverSuspension,
  FareAdminErrorCode,
  FareAdminPort,
  FareSimulationInput,
  FareSimulationResult,
  FareSimulationRoute,
  FareSimulationRow,
  FareTableDraft,
  FareTableVersion,
  GeoJsonPolygon,
  RejectDocumentInput,
  ServiceArea,
  SuspendDriverInput,
} from './types';
export type { DocumentRejection, DriverAddress, DriverCnh } from '../documents/types';

export { createDocumentStore, PROVISIONAL_REJECTION_REASONS, PROVISIONAL_REQUIREMENTS } from '../documents/mock-store';
export type { DocumentStore, DocumentStoreOptions, MockAuditEntry } from '../documents/mock-store';
export { createMockDocumentReview } from './document-review-mock-adapter';
export type { MockDocumentReview, MockDocumentReviewControl, MockDocumentReviewOptions } from './document-review-mock-adapter';
export { createMockFareAdmin } from './fare-admin-mock-adapter';
export type { MockFareAdmin, MockFareAdminControl, MockFareAdminOptions } from './fare-admin-mock-adapter';
