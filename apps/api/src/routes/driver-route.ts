/**
 * Rotas do cadastro do MOTORISTA (fatia D4 do `docs/plano-m3-m4.md` §3), com token de conta `driver`:
 *
 *   POST /v1/driver/link-application         vínculo com a candidatura aprovada (N3)       → { driverId, status }
 *   PUT  /v1/driver/onboarding               etapa 2 (CPF, nascimento, endereço, CNH)      → { status }
 *   PUT  /v1/driver/vehicle                  veículo ativo                                 → { vehicleId }
 *   GET  /v1/driver/verification             estado do cadastro e a lista vigente          → DriverVerification
 *   POST /v1/driver/documents/upload-url     URL assinada de envio (≤ 300 s)               → { documentId, uploadUrl, method, headers, expiresAt }
 *   POST /v1/driver/documents/:id/submit     confirma o envio (o servidor confere o objeto) → { status: 'submitted' }
 *   PUT  /v1/driver/availability             só a REGRA de ficar online no M3              → { phase }
 *
 * Contrato do app: `packages/api-client/src/driver/onboarding-types.ts` (catálogo `DRIVER_ONBOARDING_ERRORS` e
 * `DRIVER_AVAILABILITY_ERRORS`); o adaptador http traduz estes erros com `apiErrorFromServerReply`.
 *
 * Camadas: `requireAccount` (sessão viva) → `requireDriverAccount` (tipo da conta) → validação da forma (aqui, antes de
 * qualquer SQL) → `services/driver-onboarding-service.ts` (regras e transação) → `repositories/driver-repository.ts`.
 * O id do motorista vem SÓ da sessão; a cidade é fixada no servidor. Nenhuma resposta nem log leva CPF, CNH, endereço,
 * placa ou URL assinada. Toda resposta é `Cache-Control: no-store`.
 *
 * Aceite pendente (M-3): só ficar ONLINE cria compromisso novo, então só ele passa pelo portão `requireCurrentConsent`
 * (e só com `online: true`: ficar offline nunca é bloqueado, R7). O cadastro em si é exceção declarada em
 * `test/consent-gate-coverage.test.ts`.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../db.js';
import { env } from '../env.js';
import { currentBusinessYear, isUuid, parseAvailabilityBody, parseOnboardingBody, parseUploadRequest, parseVehicleBody } from '../domain/driver-onboarding.js';
import { makeRequireAccount } from '../hooks/require-account.js';
import { makeRequireCurrentConsent } from '../hooks/require-current-consent.js';
import { requireDriverAccount } from '../hooks/require-driver-account.js';
import { authConfigProblems, loadAuthConfig } from '../lib/auth-config.js';
import { DOCUMENT_MAX_SIZE_BYTES } from '../lib/document-storage.js';
import type { DocumentStorageSetup } from '../lib/document-storage-config.js';
import { rateLimitKey } from '../lib/ip-bucket.js';
import type { LegalConfig } from '../lib/legal-config.js';
import * as service from '../services/driver-onboarding-service.js';
import { describeErrorForLog } from '../lib/safe-error.js';
import { contextOf } from './auth-http.js';

/** Código → (status, mensagem pt-BR). As mesmas mensagens de `DRIVER_ONBOARDING_ERRORS`/`DRIVER_AVAILABILITY_ERRORS`. */
const ERRORS = {
  invalid_body: [400, 'Dados inválidos.'],
  not_driver_account: [403, 'Esta conta não é de motorista.'],
  not_found: [404, 'Documento não encontrado.'],
  application_not_approved: [409, 'Não encontramos uma candidatura aprovada para este e-mail.'],
  application_already_linked: [409, 'Esta candidatura já foi usada por outra conta. Fale com o suporte.'],
  email_not_verified: [409, 'Confirme seu e-mail antes de continuar.'],
  driver_not_linked: [409, 'Sua conta ainda não está ligada a uma candidatura aprovada.'],
  cpf_locked: [409, 'O CPF não pode ser trocado depois de informado. Fale com o suporte.'],
  cnh_locked: [409, 'Os dados da CNH estão em análise ou já foram aprovados e não mudam por aqui. Fale com o suporte.'],
  cpf_in_use: [409, 'Este CPF já está em outro cadastro de motorista. Fale com o suporte.'],
  plate_in_use: [409, 'Esta placa já está cadastrada.'],
  vehicle_not_registered: [409, 'Cadastre o veículo antes de enviar este documento.'],
  upload_missing: [409, 'O arquivo não chegou completo. Envie de novo.'],
  document_under_review: [409, 'Este documento já está em análise.'],
  invalid_transition: [409, 'Este documento já foi analisado.'],
  driver_not_approved: [409, 'Seu cadastro ainda não está aprovado para ficar online.'],
  document_expired: [409, 'Um documento obrigatório venceu. Envie a versão atualizada para ficar online.'],
  file_too_large: [413, 'O arquivo passa de 10 MB.'],
  invalid_cpf: [422, 'CPF inválido.'],
  cnh_without_ear: [422, 'A CNH precisa ter a observação EAR (exerce atividade remunerada).'],
  vehicle_too_old: [422, 'O veículo passa da idade máxima aceita.'],
  unknown_document_type: [422, 'Tipo de documento desconhecido.'],
  rate_limited: [429, 'Muitas tentativas. Aguarde um pouco.'],
  unavailable: [503, 'Serviço indisponível no momento.'],
} as const satisfies Record<string, readonly [number, string]>;

export type DriverErrorCode = keyof typeof ERRORS;

/** O catálogo do servidor, para o teste conferir contra o do `api-client` (status e código). */
export const DRIVER_ROUTE_ERRORS: Readonly<Record<DriverErrorCode, { readonly status: number; readonly message: string }>> = Object.fromEntries(
  Object.entries(ERRORS).map(([code, [status, message]]) => [code, { status, message }]),
) as Record<DriverErrorCode, { readonly status: number; readonly message: string }>;

/** Envelope de erro do projeto. */
interface Failure { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }
interface Success<T> { readonly ok: true; readonly data: T }

/**
 * Os handlers DEVOLVEM o envelope (o Fastify envia uma vez). Chamar `reply.send()` sem devolver nada, num contexto com
 * `onSend` assíncrono (este tem), faz o Fastify enviar de novo quando o handler resolve ("Reply was already sent").
 */
function refuse(request: FastifyRequest, reply: FastifyReply, event: string, code: DriverErrorCode): Failure {
  const [status, message] = ERRORS[code];
  request.log.info({ event, reason: code });
  reply.code(status);
  return { ok: false, error: { code, message } };
}

function ok<T>(reply: FastifyReply, data: T): Success<T> {
  reply.code(200);
  return { ok: true, data };
}

function sessionInvalid(reply: FastifyReply): Failure {
  reply.code(401);
  return { ok: false, error: { code: 'unauthorized', message: 'Sessão inválida ou expirada.' } };
}

/** Falha inesperada (banco, armazenamento): 503 com mensagem fixa; no log, só o evento e nome/código do erro. */
function internalFailure(request: FastifyRequest, reply: FastifyReply, err: unknown, event: string): Failure {
  request.log.error({ event, ...describeErrorForLog(err) });
  reply.code(503);
  return { ok: false, error: { code: 'unavailable', message: ERRORS.unavailable[1] } };
}

function storageUnavailable(request: FastifyRequest, reply: FastifyReply, route: string): Failure {
  request.log.error({ event: 'document_storage_unavailable', route });
  reply.code(503);
  return { ok: false, error: { code: 'unavailable', message: ERRORS.unavailable[1] } };
}

export interface DriverRoutesOptions {
  readonly legal: LegalConfig | null;
  /** `null` = armazenamento não configurado: envio e confirmação de documento respondem 503 (falha fechada). */
  readonly documents: DocumentStorageSetup | null;
}

export function registerDriverRoutes(app: FastifyInstance, options: DriverRoutesOptions): void {
  // Dado de cadastro do motorista: nada disto vai para cache de navegador, proxy ou CDN. Em `onRequest` SÍNCRONO, de
  // propósito: um `onSend` assíncrono a mais neste contexto atrasa o fim de TODA resposta dele, e as rotas de /v1/auth
  // (que chamam reply.send() sem devolver nada) passam a enviar duas vezes (ERR_HTTP_HEADERS_SENT no log; lib/early-reply.ts).
  app.addHook('onRequest', (request, reply, done) => {
    if (request.url.startsWith('/v1/driver/')) reply.header('Cache-Control', 'no-store');
    done();
  });

  // Cota própria por rota (por IPv4 ou /64), além do global: o cadastro é pouco frequente, e o pedido de URL também tem teto por conta.
  const limit = () => ({ config: { rateLimit: { max: env.DRIVER_ROUTES_RATE_LIMIT_MAX, timeWindow: '1 minute', keyGenerator: rateLimitKey } } });

  const config = loadAuthConfig();
  if (!config) {
    app.log.error({ event: 'driver_routes_unavailable', reason: 'auth_config_missing_weak_or_invalid', reasons: authConfigProblems() });
    app.all('/v1/driver/*', limit(), async (_request, reply) => {
      reply.code(503);
      return { ok: false, error: { code: 'unavailable', message: ERRORS.unavailable[1] } };
    });
    return;
  }

  const requireAccount = makeRequireAccount(config);
  const requireCurrentConsent = makeRequireCurrentConsent(options.legal, {
    // Só LIGAR cria compromisso; desligar passa sempre (R7).
    onlyWhen: (request) => typeof request.body === 'object' && request.body !== null && (request.body as { online?: unknown }).online === true,
  });
  const driverOnly = { preHandler: [requireAccount, requireDriverAccount] };

  app.post('/v1/driver/link-application', { ...limit(), ...driverOnly }, async (request, reply) => {
    try {
      const accountId = request.authAccount!.accountId;
      const context = contextOf(request, config);
      const outcome = await service.linkApplication(pool, accountId, { ipHash: context.ipHash, userAgentFamily: context.userAgentFamily, requestId: context.requestId });
      if (outcome.kind === 'ok') {
        if (outcome.linkedNow) request.log.info({ event: 'driver_application_linked', accountId });
        return ok(reply, { driverId: outcome.driverId, status: outcome.status });
      }
      if (outcome.kind === 'session_invalid') return sessionInvalid(reply);
      return refuse(request, reply, 'driver_link_refused', outcome.kind);
    } catch (err) {
      return internalFailure(request, reply, err, 'driver_link_failed_internal');
    }
  });

  app.put('/v1/driver/onboarding', { ...limit(), ...driverOnly }, async (request, reply) => {
    const input = parseOnboardingBody(request.body);
    if (!input) return refuse(request, reply, 'driver_onboarding_refused', 'invalid_body');
    try {
      const outcome = await service.saveOnboarding(pool, request.authAccount!.accountId, input);
      if (outcome.kind !== 'ok') return refuse(request, reply, 'driver_onboarding_refused', outcome.kind);
      request.log.info({ event: 'driver_onboarding_saved', accountId: request.authAccount!.accountId });
      return ok(reply, { status: outcome.status });
    } catch (err) {
      return internalFailure(request, reply, err, 'driver_onboarding_failed_internal');
    }
  });

  app.put('/v1/driver/vehicle', { ...limit(), ...driverOnly }, async (request, reply) => {
    const input = parseVehicleBody(request.body, currentBusinessYear());
    if (!input) return refuse(request, reply, 'driver_vehicle_refused', 'invalid_body');
    try {
      const outcome = await service.saveVehicle(pool, request.authAccount!.accountId, input);
      if (outcome.kind !== 'ok') return refuse(request, reply, 'driver_vehicle_refused', outcome.kind);
      request.log.info({ event: 'driver_vehicle_saved', accountId: request.authAccount!.accountId });
      return ok(reply, { vehicleId: outcome.vehicleId });
    } catch (err) {
      return internalFailure(request, reply, err, 'driver_vehicle_failed_internal');
    }
  });

  app.get('/v1/driver/verification', { ...limit(), ...driverOnly }, async (request, reply) => {
    try {
      return ok(reply, await service.getVerification(pool, request.authAccount!.accountId));
    } catch (err) {
      return internalFailure(request, reply, err, 'driver_verification_failed_internal');
    }
  });

  app.post('/v1/driver/documents/upload-url', { ...limit(), ...driverOnly }, async (request, reply) => {
    const parsed = parseUploadRequest(request.body, DOCUMENT_MAX_SIZE_BYTES);
    if (!parsed.ok) return refuse(request, reply, 'driver_upload_url_refused', parsed.code);
    if (!options.documents) return storageUnavailable(request, reply, 'upload-url');
    try {
      const outcome = await service.requestUploadUrl(pool, request.authAccount!.accountId, parsed.value, {
        storage: options.documents.storage,
        urlTtlSeconds: options.documents.urlTtlSeconds,
        maxRequestsPerHour: env.DRIVER_UPLOAD_URLS_PER_HOUR,
      });
      if (outcome.kind === 'too_many_requests') return refuse(request, reply, 'driver_upload_url_refused', 'rate_limited');
      if (outcome.kind !== 'ok') return refuse(request, reply, 'driver_upload_url_refused', outcome.kind);
      // O documentId identifica o envio; a URL assinada é credencial temporária e NUNCA vai para o log.
      request.log.info({ event: 'driver_upload_url_issued', accountId: request.authAccount!.accountId, documentId: outcome.documentId, typeCode: parsed.value.typeCode });
      return ok(reply, { documentId: outcome.documentId, uploadUrl: outcome.uploadUrl, method: 'PUT', headers: outcome.headers, expiresAt: outcome.expiresAt.toISOString() });
    } catch (err) {
      return internalFailure(request, reply, err, 'driver_upload_url_failed_internal');
    }
  });

  app.post<{ Params: { id: string } }>('/v1/driver/documents/:id/submit', { ...limit(), ...driverOnly }, async (request, reply) => {
    // Id que nem é UUID: 404 igual ao de outro motorista (e o `pg` nunca vê um valor inválido para ecoar).
    if (!isUuid(request.params.id)) return refuse(request, reply, 'driver_document_submit_refused', 'not_found');
    if (!options.documents) return storageUnavailable(request, reply, 'submit');
    try {
      const outcome = await service.submitDocument(pool, request.authAccount!.accountId, request.params.id.toLowerCase(), options.documents.storage);
      if (outcome.kind !== 'ok') return refuse(request, reply, 'driver_document_submit_refused', outcome.kind);
      request.log.info({ event: 'driver_document_submitted', accountId: request.authAccount!.accountId, documentId: request.params.id });
      return ok(reply, { status: 'submitted' as const });
    } catch (err) {
      return internalFailure(request, reply, err, 'driver_document_submit_failed_internal');
    }
  });

  app.put('/v1/driver/availability', { ...limit(), preHandler: [requireAccount, requireDriverAccount, requireCurrentConsent] }, async (request, reply) => {
    const input = parseAvailabilityBody(request.body);
    if (!input) return refuse(request, reply, 'driver_availability_refused', 'invalid_body');
    try {
      const outcome = await service.setAvailability(pool, request.authAccount!.accountId, input.online);
      if (outcome.kind !== 'ok') return refuse(request, reply, 'driver_availability_refused', outcome.kind);
      return ok(reply, { phase: outcome.phase });
    } catch (err) {
      return internalFailure(request, reply, err, 'driver_availability_failed_internal');
    }
  });
}
