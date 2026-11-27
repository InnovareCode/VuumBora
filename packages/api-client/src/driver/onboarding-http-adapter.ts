/**
 * Adaptadores `http` do cadastro do motorista (fatia D4 do `docs/plano-m3-m4.md`): `/v1/driver/*` com o access token da
 * sessão. Mesmo contrato e MESMOS erros do mock (`createMockDriverOnboarding`): toda recusa passa por
 * `apiErrorFromServerReply` com o mapa de campos do catálogo (`DRIVER_ONBOARDING_ERRORS`, `DRIVER_AVAILABILITY_ERRORS`).
 *
 * - O token vem do `SessionManager.run` (renova em 401 e repete UMA vez); este arquivo nunca guarda token.
 * - Cada corpo é montado CAMPO A CAMPO (sobra de formulário não vai ao servidor).
 * - `baseUrl` https; `http:` só com `allowInsecureHttp` (desenvolvimento), como a identidade.
 * - Timeout em toda chamada (padrão 15 s) → `network`. Sem repetição automática (quem repete é a tela).
 * - A resposta de SUCESSO é conferida: 200 com outra forma vira `unknown` (portal cativo, proxy).
 * - `createDocumentUploadHttpAdapter` faz o PUT do arquivo direto no armazenamento (não é a API): 403 da URL vencida
 *   vira `forbidden` com `code: 'upload_url_expired'` (peça outra URL). Progresso: o `fetch` não informa bytes
 *   enviados, então `onProgress` recebe só `1` ao terminar.
 * - A URL de envio leva foto de CNH: `https:` obrigatório, como a `baseUrl`. `http:` só com `allowInsecureHttp`
 *   (desenvolvimento, armazenamento local). Resposta da API com URL `http:` sem essa opção vira `unknown`.
 * - Não loga nada: URL assinada e dado pessoal passam por aqui.
 */
import type { DriverPhase } from '@vuumbora/domain/driver';
import type { ApiError, Result } from '../index';
import { createAuthedRequester, type AuthedHttpOptions } from '../http/authed-requester';
import { NETWORK_ERROR } from '../identity/errors';
import { fieldsOfCatalog, type FieldByCode } from '../server-error';
import { failWith, succeed } from '../trip/result';
import type { DocumentRequirement, DriverDocumentSummary, DriverVehicleInput } from '../documents/types';
import type { DriverAvailabilityInput, DriverJourneyPort } from './types';
import {
  DRIVER_AVAILABILITY_ERRORS,
  DRIVER_ONBOARDING_ERRORS,
  type DocumentUploadPort,
  type DocumentUploadRequest,
  type DocumentUploadTarget,
  type DriverOnboardingInput,
  type DriverOnboardingPort,
  type DriverVerification,
  type LinkApplicationResult,
  type UploadSource,
} from './onboarding-types';

/** Opções dos adaptadores http do motorista (as mesmas de toda porta autenticada: `http/authed-requester.ts`). */
export type DriverHttpOptions = AuthedHttpOptions;

const VERIFICATION_STATUSES = new Set(['not_started', 'pending_documents', 'under_review', 'changes_requested', 'approved', 'suspended']);
const DOCUMENT_STATUSES = new Set(['submitted', 'approved', 'rejected', 'expired']);
const ONBOARDING_FIELDS: FieldByCode = fieldsOfCatalog(DRIVER_ONBOARDING_ERRORS);
const AVAILABILITY_FIELDS: FieldByCode = fieldsOfCatalog(DRIVER_AVAILABILITY_ERRORS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isIso(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function parseDocument(value: unknown): DriverDocumentSummary | null {
  if (!isRecord(value) || !nonEmptyString(value['id']) || typeof value['status'] !== 'string' || !DOCUMENT_STATUSES.has(value['status'])) return null;
  const rejection = value['rejection'];
  const expiresOn = value['expiresOn'];
  if (rejection !== undefined && (!isRecord(rejection) || !nonEmptyString(rejection['code']) || typeof rejection['text'] !== 'string')) return null;
  if (expiresOn !== undefined && (typeof expiresOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn))) return null;
  return {
    id: value['id'],
    status: value['status'] as DriverDocumentSummary['status'],
    ...(isRecord(rejection) ? { rejection: { code: rejection['code'] as string, text: rejection['text'] as string } } : {}),
    ...(typeof expiresOn === 'string' ? { expiresOn } : {}),
  };
}

function parseRequirement(value: unknown): DocumentRequirement | null {
  if (!isRecord(value) || !nonEmptyString(value['typeCode']) || typeof value['label'] !== 'string') return null;
  if (typeof value['required'] !== 'boolean' || typeof value['hasExpiry'] !== 'boolean') return null;
  const base = { typeCode: value['typeCode'], label: value['label'], required: value['required'], hasExpiry: value['hasExpiry'] };
  if (value['document'] === undefined) return base;
  const document = parseDocument(value['document']);
  return document ? { ...base, document } : null;
}

export function parseVerification(value: unknown): DriverVerification | null {
  if (!isRecord(value) || typeof value['status'] !== 'string' || !VERIFICATION_STATUSES.has(value['status'])) return null;
  const onboarding = value['onboarding'];
  if (!isRecord(onboarding) || typeof onboarding['profileSubmitted'] !== 'boolean' || typeof onboarding['vehicleRegistered'] !== 'boolean') return null;
  const deadline = value['reviewDeadline'];
  if (deadline !== undefined && !isIso(deadline)) return null;
  if (!Array.isArray(value['requirements'])) return null;
  const requirements: DocumentRequirement[] = [];
  for (const raw of value['requirements']) {
    const requirement = parseRequirement(raw);
    if (!requirement) return null;
    requirements.push(requirement);
  }
  return {
    status: value['status'] as DriverVerification['status'],
    ...(typeof deadline === 'string' ? { reviewDeadline: deadline } : {}),
    onboarding: { profileSubmitted: onboarding['profileSubmitted'], vehicleRegistered: onboarding['vehicleRegistered'] },
    requirements,
  };
}

function isAllowedUploadUrl(value: string, allowInsecureHttp: boolean): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (allowInsecureHttp && url.protocol === 'http:');
  } catch {
    return false;
  }
}

function parseUploadTarget(value: unknown, allowInsecureHttp: boolean): DocumentUploadTarget | null {
  if (!isRecord(value) || !nonEmptyString(value['documentId']) || !nonEmptyString(value['uploadUrl']) || value['method'] !== 'PUT') return null;
  if (!isIso(value['expiresAt']) || !isRecord(value['headers'])) return null;
  const headers: Record<string, string> = {};
  for (const [name, headerValue] of Object.entries(value['headers'])) {
    if (typeof headerValue !== 'string') return null;
    headers[name] = headerValue;
  }
  if (!isAllowedUploadUrl(value['uploadUrl'], allowInsecureHttp)) return null;
  return { documentId: value['documentId'], uploadUrl: value['uploadUrl'], method: 'PUT', headers, expiresAt: value['expiresAt'] as string };
}

export function createDriverOnboardingHttpAdapter(options: DriverHttpOptions): DriverOnboardingPort {
  const request = createAuthedRequester(options, 'createDriverOnboardingHttpAdapter');
  const fields = ONBOARDING_FIELDS;

  return {
    linkApplication: () =>
      request<LinkApplicationResult>({
        method: 'POST',
        path: '/v1/driver/link-application',
        body: {},
        fields,
        parse: (data) =>
          isRecord(data) && nonEmptyString(data['driverId']) && typeof data['status'] === 'string' && VERIFICATION_STATUSES.has(data['status'])
            ? { driverId: data['driverId'], status: data['status'] as LinkApplicationResult['status'] }
            : null,
      }),

    saveOnboarding: (input: DriverOnboardingInput) =>
      request({
        method: 'PUT',
        path: '/v1/driver/onboarding',
        body: {
          cpf: input.cpf,
          birthDate: input.birthDate,
          address: {
            street: input.address.street,
            number: input.address.number,
            ...(input.address.complement !== undefined ? { complement: input.address.complement } : {}),
            neighborhood: input.address.neighborhood,
            city: input.address.city,
            state: input.address.state,
            postalCode: input.address.postalCode,
          },
          cnh: { number: input.cnh.number, category: input.cnh.category, expiresOn: input.cnh.expiresOn, ear: input.cnh.ear },
        },
        fields,
        parse: (data) =>
          isRecord(data) && typeof data['status'] === 'string' && VERIFICATION_STATUSES.has(data['status'])
            ? { status: data['status'] as DriverVerification['status'] }
            : null,
      }),

    saveVehicle: (input: DriverVehicleInput) =>
      request({
        method: 'PUT',
        path: '/v1/driver/vehicle',
        body: { plate: input.plate, brand: input.brand, model: input.model, year: input.year, color: input.color },
        fields,
        parse: (data) => (isRecord(data) && nonEmptyString(data['vehicleId']) ? { vehicleId: data['vehicleId'] } : null),
      }),

    verification: () => request({ method: 'GET', path: '/v1/driver/verification', fields, parse: parseVerification }),

    requestUploadUrl: (input: DocumentUploadRequest) =>
      request({
        method: 'POST',
        path: '/v1/driver/documents/upload-url',
        body: { typeCode: input.typeCode, contentType: input.contentType, sizeBytes: input.sizeBytes, sha256: input.sha256 },
        fields,
        parse: (data) => parseUploadTarget(data, options.allowInsecureHttp === true),
      }),

    submitDocument: (documentId: string) =>
      request({
        method: 'POST',
        path: `/v1/driver/documents/${encodeURIComponent(documentId)}/submit`,
        body: {},
        fields,
        parse: (data) => (isRecord(data) && data['status'] === 'submitted' ? { status: 'submitted' as const } : null),
      }),
  };
}

/**
 * `PUT /v1/driver/availability` (M3: só a regra; o estado online é do M5). `409` vira `conflict` com `reason = code`
 * (`driver_not_approved`, `document_expired`, `consent_outdated`), igual ao `availabilityConflict` do mock.
 */
export function createDriverJourneyHttpAdapter(options: DriverHttpOptions): DriverJourneyPort {
  const request = createAuthedRequester(options, 'createDriverJourneyHttpAdapter');
  return {
    setAvailability: (input: DriverAvailabilityInput) =>
      request<{ readonly phase: DriverPhase }>({
        method: 'PUT',
        path: '/v1/driver/availability',
        body: {
          online: input.online,
          ...(input.point ? { point: { latitude: input.point.latitude, longitude: input.point.longitude } } : {}),
        },
        fields: AVAILABILITY_FIELDS,
        parse: (data) => (isRecord(data) && (data['phase'] === 'online' || data['phase'] === 'offline') ? { phase: data['phase'] } : null),
      }),
  };
}

export interface DocumentUploadHttpOptions {
  readonly fetch?: typeof fetch;
  /** Aceita URL de envio `http:` (armazenamento local). SÓ desenvolvimento: fora disso, `https:` obrigatório. */
  readonly allowInsecureHttp?: boolean;
  /** Envio pode ser lento em 3G: padrão 120 s. */
  readonly timeoutMs?: number;
}

/** O PUT do arquivo na URL assinada. Lê o arquivo de `source.uri` (`file://`, `content://` ou `blob:`) pelo próprio `fetch`. */
export function createDocumentUploadHttpAdapter(options: DocumentUploadHttpOptions = {}): DocumentUploadPort {
  const fetchImpl = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 120_000;
  const expired: ApiError = { kind: 'forbidden', code: 'upload_url_expired' };

  return {
    async upload(target: DocumentUploadTarget, source: UploadSource, onProgress?: (fraction: number) => void): Promise<Result<void>> {
      if (!isRecord(source) || !nonEmptyString(source.uri)) return failWith({ kind: 'validation', fields: { form: 'Arquivo inválido.' }, code: 'invalid_body' });
      if (!isAllowedUploadUrl(target.uploadUrl, options.allowInsecureHttp === true)) {
        return failWith({ kind: 'unknown', message: 'URL de envio sem https.' });
      }
      if (Date.parse(target.expiresAt) <= Date.now()) return failWith(expired);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const file = await (await fetchImpl(source.uri)).blob();
        // `Content-Length` é calculado pelo runtime a partir do corpo (o navegador proíbe defini-lo); o valor assinado é o mesmo.
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(target.headers)) {
          if (name.toLowerCase() !== 'content-length') headers[name] = value;
        }
        const response = await fetchImpl(target.uploadUrl, { method: 'PUT', headers, body: file, signal: controller.signal, credentials: 'omit' });
        if (response.ok) {
          onProgress?.(1);
          return succeed(undefined, 'real');
        }
        if (response.status === 403) return failWith(expired);
        if (response.status >= 500) return failWith({ kind: 'unavailable', retryable: true });
        return failWith({ kind: 'unknown', message: `envio recusado (HTTP ${response.status})` });
      } catch {
        return failWith(NETWORK_ERROR);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
