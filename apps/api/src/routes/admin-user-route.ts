/**
 * Rotas HTTP — gestão de usuários do painel (F07), só papel `dono`. Só
 * traduz requisição/resposta; a regra mora em `admin-user-service.ts`.
 * Caminhos relativos a `/v1/admin` (prefixo aplicado em `app.ts`).
 *
 * Ninguém cria o próprio usuário — só o `dono` cria outros. O primeiro
 * acesso de quem é criado é por um token de ativação de uso único (reaproveita
 * o mecanismo da 0016), nunca por uma senha que alguém escolheu por ele.
 * Contrato: docs/contrato-admin-usuarios.md.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { pool } from '../db.js';
import { ADMIN_ROLES } from '../domain/admin.js';
import { adminRouteRateLimit } from '../lib/admin-rate-limit.js';
import { twoFactorConfig } from '../lib/two-factor-config.js';
import { requireAdminRole, requireCsrfToken } from '../hooks/require-admin.js';
import {
  activateAdminUser,
  changeAdminUserRole,
  createAdminUser,
  deactivateAdminUser,
  listAdminUsers,
  reactivateAdminUser,
  type MutateAdminUserOutcome,
  type StepUpFailure,
} from '../services/admin-user-service.js';

const roleEnum = z.enum(ADMIN_ROLES);

const listQuerySchema = z.object({
  role: roleEnum.optional(),
  // NUNCA `z.coerce.boolean()` aqui: ele só faz `Boolean(valor)`, e a STRING "false" da querystring é verdadeira
  // (não vazia) — `?includeDeactivated=false` viraria `true`. Só as duas strings literais contam.
  includeDeactivated: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
  cursor: z.string().trim().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid('Identificador inválido.') });

// Senha ATUAL de quem está chamando (reautenticação, M-3) — nunca a senha do usuário alvo. `code` (TOTP) é
// opcional AQUI: só é exigido (e checado) quando a mutação envolve o papel `dono`/`financeiro` — ponto 3 da
// revisão S1 rodada 3g. O serviço decide; a rota só repassa o que veio.
const actorPasswordSchema = z.object({
  password: z.string().min(1, 'Informe sua senha.').max(200, 'Senha inválida.'),
  code: z.string().trim().min(6, 'Código inválido.').max(32, 'Código inválido.').optional(),
});

const createBodySchema = actorPasswordSchema.extend({
  name: z.string().trim().min(2, 'Informe o nome completo.').max(120, 'Nome muito longo.'),
  email: z.string().trim().toLowerCase().min(3, 'E-mail inválido.').max(254, 'E-mail inválido.').email('E-mail inválido.'),
  role: roleEnum,
});

const roleBodySchema = actorPasswordSchema.extend({ role: roleEnum });

const MIN_ACTIVATION_PASSWORD_LENGTH = 12;
const activateBodySchema = z.object({
  email: z.string().trim().toLowerCase().min(3, 'E-mail inválido.').max(254, 'E-mail inválido.').email('E-mail inválido.'),
  token: z.string().trim().min(10, 'Token inválido.').max(64, 'Token inválido.'),
  newPassword: z.string().min(MIN_ACTIVATION_PASSWORD_LENGTH, `A senha deve ter pelo menos ${MIN_ACTIVATION_PASSWORD_LENGTH} caracteres.`).max(200, 'Senha inválida.'),
});

const requireOwner = requireAdminRole('dono');
const requireOwnerMutation = [requireOwner, requireCsrfToken];
const DEFAULT_LIMIT = 20;

function sendValidationFailed(reply: FastifyReply, message = 'Dados inválidos.'): void {
  reply.code(400).send({ ok: false, error: { code: 'validation_failed', message } });
}

/** Falha do gate — senha sozinha, ou senha + TOTP quando a mutação envolve `dono`/`financeiro` (ponto 3). */
function sendStepUpFailure(reply: FastifyReply, failure: StepUpFailure): void {
  switch (failure.kind) {
    case 'account_locked':
      reply.header('Retry-After', String(failure.retryAfterSeconds));
      reply.code(423).send({ ok: false, error: { code: 'account_locked', message: 'Muitas tentativas de senha. Tente novamente mais tarde.', retryAfterSeconds: failure.retryAfterSeconds } });
      return;
    case 'password_invalid':
      reply.code(401).send({ ok: false, error: { code: 'password_invalid', message: 'Senha incorreta.' } });
      return;
    case 'invalid_code':
      reply.code(401).send({ ok: false, error: { code: 'invalid_second_factor', message: 'Código de verificação inválido.' } });
      return;
    case 'two_factor_locked':
      reply.header('Retry-After', String(failure.retryAfterSeconds));
      reply.code(429).send({ ok: false, error: { code: 'two_factor_locked', message: 'Muitas tentativas com código errado. Tente novamente mais tarde.', retryAfterSeconds: failure.retryAfterSeconds } });
      return;
    case 'two_factor_unavailable':
      reply.code(503).send({ ok: false, error: { code: 'two_factor_unavailable', message: 'Verificação em duas etapas indisponível. Contate o responsável técnico.' } });
      return;
    case 'two_factor_not_enrolled':
      reply.code(409).send({ ok: false, error: { code: 'two_factor_not_enrolled', message: 'Sua conta ainda não tem a verificação em duas etapas ativa; é preciso para esta ação.' } });
      return;
  }
}

function sendMutationOutcome(reply: FastifyReply, outcome: MutateAdminUserOutcome): void {
  switch (outcome.kind) {
    case 'ok':
      reply.code(200).send({ ok: true, data: outcome.user });
      return;
    case 'not_found':
      reply.code(404).send({ ok: false, error: { code: 'not_found', message: 'Usuário não encontrado.' } });
      return;
    case 'last_owner':
      reply.code(409).send({ ok: false, error: { code: 'last_owner', message: 'Não é possível desativar ou rebaixar o último dono ativo.' } });
      return;
    case 'retry':
      reply.code(409).send({ ok: false, error: { code: 'concurrent_update', message: 'Outra alteração está em andamento para este usuário. Tente novamente em alguns segundos.' } });
      return;
    default:
      sendStepUpFailure(reply, outcome);
  }
}

export function registerAdminUserRoutes(app: FastifyInstance): void {
  app.get('/users', { ...adminRouteRateLimit(), preHandler: requireOwner }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) return sendValidationFailed(reply, 'Parâmetros de busca inválidos.');

    const outcome = await listAdminUsers(
      pool,
      { role: parsed.data.role, includeDeactivated: parsed.data.includeDeactivated ?? false, cursor: parsed.data.cursor, limit: parsed.data.limit ?? DEFAULT_LIMIT },
      { adminId: request.admin!.id, ipAddress: request.ip },
    );
    if (outcome.kind === 'invalid_cursor') {
      reply.code(400).send({ ok: false, error: { code: 'invalid_cursor', message: 'Cursor de paginação inválido.' } });
      return;
    }
    reply.code(200).send({ ok: true, data: { items: outcome.items, nextCursor: outcome.nextCursor } });
  });

  app.post('/users', { ...adminRouteRateLimit(), preHandler: requireOwnerMutation }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = createBodySchema.safeParse(request.body);
    if (!parsed.success) return sendValidationFailed(reply);

    const outcome = await createAdminUser(
      pool,
      request.admin!,
      { name: parsed.data.name, email: parsed.data.email, role: parsed.data.role, password: parsed.data.password, code: parsed.data.code },
      { ipAddress: request.ip, twoFactor: twoFactorConfig },
    );
    if (outcome.kind === 'email_taken') {
      reply.code(409).send({ ok: false, error: { code: 'email_taken', message: 'Já existe um usuário com este e-mail.' } });
      return;
    }
    if (outcome.kind !== 'ok') return sendStepUpFailure(reply, outcome);

    reply.code(201).send({
      ok: true,
      data: { ...outcome.user, activationToken: outcome.activationToken, activationTokenExpiresAt: outcome.activationTokenExpiresAt },
    });
  });

  app.post('/users/:id/deactivate', { ...adminRouteRateLimit(), preHandler: requireOwnerMutation }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsedParams = idParamSchema.safeParse(request.params);
    if (!parsedParams.success) return sendValidationFailed(reply, 'Identificador inválido.');
    const parsedBody = actorPasswordSchema.safeParse(request.body);
    if (!parsedBody.success) return sendValidationFailed(reply);

    const outcome = await deactivateAdminUser(pool, request.admin!, parsedParams.data.id, { password: parsedBody.data.password }, { ipAddress: request.ip });
    sendMutationOutcome(reply, outcome);
  });

  app.post('/users/:id/reactivate', { ...adminRouteRateLimit(), preHandler: requireOwnerMutation }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsedParams = idParamSchema.safeParse(request.params);
    if (!parsedParams.success) return sendValidationFailed(reply, 'Identificador inválido.');
    const parsedBody = actorPasswordSchema.safeParse(request.body);
    if (!parsedBody.success) return sendValidationFailed(reply);

    const outcome = await reactivateAdminUser(
      pool,
      request.admin!,
      parsedParams.data.id,
      { password: parsedBody.data.password, code: parsedBody.data.code },
      { ipAddress: request.ip, twoFactor: twoFactorConfig },
    );
    sendMutationOutcome(reply, outcome);
  });

  app.post('/users/:id/role', { ...adminRouteRateLimit(), preHandler: requireOwnerMutation }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsedParams = idParamSchema.safeParse(request.params);
    if (!parsedParams.success) return sendValidationFailed(reply, 'Identificador inválido.');
    const parsedBody = roleBodySchema.safeParse(request.body);
    if (!parsedBody.success) return sendValidationFailed(reply);

    const outcome = await changeAdminUserRole(
      pool,
      request.admin!,
      parsedParams.data.id,
      parsedBody.data.role,
      { password: parsedBody.data.password, code: parsedBody.data.code },
      { ipAddress: request.ip, twoFactor: twoFactorConfig },
    );
    sendMutationOutcome(reply, outcome);
  });
}

/**
 * Primeiro acesso — SEM sessão (quem chama ainda não tem cookie nenhum): o "bearer" é o token de ativação de uso
 * único que o dono entregou fora de banda. Registrada separada de `registerAdminUserRoutes` porque esta é
 * pública (nenhum `requireAdmin`) e tem limite de taxa da CLASSE login, não a genérica do CRUD acima.
 */
export function registerAdminUserActivationRoute(
  app: FastifyInstance,
  rateLimit: { readonly config: { readonly rateLimit: { readonly max: number; readonly timeWindow: number; readonly keyGenerator: (request: { ip: string }) => string } } },
): void {
  app.post('/auth/activate', rateLimit, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = activateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      sendValidationFailed(reply, field === 'newPassword' ? `A senha deve ter pelo menos ${MIN_ACTIVATION_PASSWORD_LENGTH} caracteres.` : 'Informe e-mail, token e a nova senha.');
      return;
    }

    const outcome = await activateAdminUser(pool, parsed.data, { ipAddress: request.ip });
    if (outcome.kind === 'invalid') {
      // Mesma resposta para e-mail inexistente, admin desativado e token ausente/errado/vencido/já usado — sem oráculo.
      reply.code(400).send({ ok: false, error: { code: 'activation_token_invalid', message: 'Token de ativação inválido, vencido ou já usado.' } });
      return;
    }
    reply.code(200).send({
      ok: true,
      data: {
        role: outcome.role,
        requiresTwoFactorEnrollment: outcome.requiresTwoFactorEnrollment,
        ...(outcome.enrollmentToken ? { enrollmentToken: outcome.enrollmentToken, enrollmentTokenExpiresAt: outcome.enrollmentTokenExpiresAt } : {}),
      },
    });
  });
}
