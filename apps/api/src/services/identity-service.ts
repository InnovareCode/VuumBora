/**
 * Regra de negócio da identidade dos apps (login por e-mail ou ID + senha, contas
 * separadas por tipo). Sem HTTP aqui: recebe dados já validados e devolve
 * resultados tipados que a rota traduz em status. Regras que valem o cuidado
 * de quem revisa:
 *  - e-mail inexistente e senha errada são INDISTINGUÍVEIS (mesmo resultado, mesmo custo de bcrypt);
 *  - login sob ATRASO PROGRESSIVO por (tipo+identificador+IP) (1 s, 2 s, 4 s... até 15 min), reservado sob lock
 *    no banco: quem sabe o e-mail da vítima NÃO a tranca de fora (outro IP = outro par, sem espera);
 *  - cadastro NÃO abre sessão: gera código de 6 dígitos e envia por e-mail;
 *  - conta sem e-mail verificado: senha certa => `email_not_verified`, nunca sessão;
 *  - renovação só por `rotate_refresh_token()`; qualquer desfecho != 'rotated' é recusa.
 */
import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import type { AccountSummary, AccountType, DeviceInput } from '../domain/auth.js';
import { normalizeIdentifier } from '../domain/auth.js';
import type { AuthConfig } from '../lib/auth-config.js';
import { generateEmailCode, hashEmailCode } from '../lib/email-code.js';
import { canonicalEmailForLimit } from '../lib/email-normalize.js';
import { emailGlobalKey } from '../lib/email-budget.js';
import { LOGIN_FAILURE_MEMORY_HOURS } from '../lib/progressive-delay.js';
import { hmacHex, newOpaqueToken, sha256Hex, signAccessToken } from '../lib/token-crypto.js';
import { issueEmailCode } from '../repositories/email-code-repository.js';
import {
  BirthDateRejectedError, createSession, EmailTakenError, findAccountById, findLoginCandidate, getRefreshTokenExpiry, insertAccessLog, insertConsents, insertOrReclaimAccount,
  PublicIdCollisionError, recordLoginSuccess, reserveAttempts, reserveDelayedAttempt, revokeAllFamilies, revokeFamilyByRefreshHash,
  rotateRefreshToken, upsertDevice, type AttemptKey, type Queryable,
} from '../repositories/identity-repository.js';
import { deliverCode, type MailDeps } from './code-delivery.js';

export { BirthDateRejectedError, EmailTakenError };

export interface RequestContext {
  /** HMAC do IP (ou `null` se desconhecido). O IP em claro nunca entra aqui. */
  readonly ipHash: string | null;
  readonly userAgentFamily: string;
  readonly requestId: string;
}

export interface SessionTokens {
  readonly accessToken: string;
  readonly accessTokenExpiresAt: string;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
}

export interface AuthenticatedSession extends SessionTokens {
  readonly account: AccountSummary;
}

export type LoginResult =
  | { kind: 'ok'; session: AuthenticatedSession }
  | { kind: 'invalid_credentials' }
  | { kind: 'email_not_verified' }
  /** Espera progressiva do par ainda não passou (I-6): tente de novo daqui a `retryAfterSeconds`. Nada foi comparado nem gravado. */
  | { kind: 'blocked'; retryAfterSeconds: number };

export type RefreshResult = { kind: 'ok'; tokens: SessionTokens } | { kind: 'invalid' };

function issueAccessToken(config: AuthConfig, accountId: string, familyId: string): { token: string; expiresAt: Date } {
  return signAccessToken(config.jwtSecret, { sub: accountId, sid: familyId }, config.accessTtlSeconds);
}

/** Abre uma sessão nova (família + primeiro refresh) para a conta. Roda na transação do chamador. */
async function openSession(
  db: Queryable,
  config: AuthConfig,
  account: AccountSummary,
  device: DeviceInput | undefined,
  ctx: RequestContext,
): Promise<AuthenticatedSession> {
  const deviceId = device ? await upsertDevice(db, account.id, device) : null;
  const refreshToken = newOpaqueToken();
  const now = Date.now();
  const { familyId, refreshExpiresAt } = await createSession(db, {
    accountId: account.id,
    deviceId,
    tokenHash: sha256Hex(refreshToken),
    refreshExpiresAt: new Date(now + config.refreshTtlMs),
    familyExpiresAt: new Date(now + config.sessionAbsoluteTtlMs),
  });
  await insertAccessLog(db, { event: 'login_success', accountId: account.id, deviceId, ...ctx });
  const access = issueAccessToken(config, account.id, familyId);
  return {
    account,
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    refreshToken,
    refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
  };
}

export interface RegisterInput {
  readonly accountType: AccountType;
  readonly fullName: string;
  readonly email: string;
  readonly password: string;
  readonly phone: string | null;
  /** `AAAA-MM-DD`, já validada (18+). Dado pessoal: vai ao banco e nunca mais é lida, logada nem devolvida. */
  readonly birthDate: string;
}

export type RegisterResult =
  | { kind: 'ok'; account: AccountSummary; emailSent: boolean; resendAfterSeconds: number; reclaimed: boolean }
  | { kind: 'blocked' }
  /** Versões dos Termos/Política não configuradas: sem elas não há como registrar o aceite, então não se cadastra. */
  | { kind: 'consent_unavailable' };

/**
 * Chaves do limite do escopo `register`: por (tipo + e-mail CANONICAL), por IP e o teto GLOBAL de e-mails de
 * verificação. O e-mail canonical junta `+tag` e pontos do Gmail (I-5c); o IP é o balde (/64 no IPv6, I-5d) e
 * nunca entra em claro (só o HMAC dele).
 */
function registerKeys(config: AuthConfig, accountType: AccountType, email: string, ctx: RequestContext): AttemptKey[] {
  const keys: AttemptKey[] = [
    { identifierHash: hmacHex(config.pepper, `${accountType}:${canonicalEmailForLimit(email)}`), max: config.registerMaxPerIdentifier },
    emailGlobalKey(config, 'verify_email'),
  ];
  if (ctx.ipHash) keys.push({ identifierHash: hmacHex(config.pepper, `ip:${ctx.ipHash}`), max: config.registerMaxPerIp });
  return keys;
}

/**
 * Cria conta + credencial + código de verificação numa transação e envia o
 * código por e-mail DEPOIS do commit. NÃO abre sessão. Lança `EmailTakenError`
 * se o e-mail já tem uma conta VERIFICADA NAQUELE tipo (resposta explícita, decisão do
 * dono — por isso cada consulta conta no limite do escopo `register`). Se a conta
 * existente NÃO foi verificada, ela é SUBSTITUÍDA por uma conta nova (id, senha, código e aceite novos; a antiga
 * some, com o aceite do primeiro cadastrante) — I-4: ninguém "reserva" o e-mail de outra pessoa.
 * Se o envio falhar a conta existe e o cliente pede reenvio (`emailSent: false`).
 */
export async function registerAccount(pool: Pool, config: AuthConfig, deps: MailDeps, input: RegisterInput, ctx: RequestContext): Promise<RegisterResult> {
  const versions = config.consentVersions;
  if (!versions) return { kind: 'consent_unavailable' };
  const allowed = await reserveAttempts(pool, {
    scope: 'register',
    keys: registerKeys(config, input.accountType, input.email, ctx),
    ipHash: ctx.ipHash,
    windowMinutes: config.registerWindowMinutes,
  });
  if (!allowed) return { kind: 'blocked' };

  const passwordHash = await bcrypt.hash(input.password, config.bcryptCost);
  // `public_id` é aleatório de 40 bits: colisão é improvável, mas o UNIQUE a barra e aqui se repete.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let registered: { account: AccountSummary; reclaimed: boolean; code: string };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { account, reclaimed } = await insertOrReclaimAccount(client, { ...input, passwordHash });
      // O aceite entra na MESMA transação da conta: não existe conta sem aceite registrado.
      await insertConsents(client, { accountId: account.id, termsVersion: versions.termsOfUse, privacyVersion: versions.privacyPolicy, ipHash: ctx.ipHash });
      const code = generateEmailCode();
      const issued = await issueEmailCode(client, {
        accountId: account.id,
        purpose: 'verify_email',
        codeHash: hashEmailCode(config.pepper, 'verify_email', account.id, code),
        ttlSeconds: config.emailCodeTtlSeconds,
        minIntervalSeconds: config.emailCodeMinIntervalSeconds,
        maxPerHour: config.emailCodeMaxPerHour,
      });
      // A conta é SEMPRE nova (no recadastro a anterior foi substituída, sem histórico de códigos): o código sai.
      // O teto de e-mails por endereço no recadastro é o do próprio cadastro (5 por e-mail canonical por hora + teto global).
      if (issued.outcome !== 'issued') throw new Error('register_code_not_issued');
      await insertAccessLog(client, { event: 'register', accountId: account.id, deviceId: null, ...ctx });
      await client.query('COMMIT');
      registered = { account, reclaimed, code };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (err instanceof PublicIdCollisionError && attempt < 2) continue;
      throw err;
    } finally {
      // A conexão volta ao pool ANTES do trabalho pós-commit: segurá-la enquanto se pede outra ao pool trava o
      // serviço quando há tantos cadastros simultâneos quantas conexões (deadlock do pool).
      client.release();
    }

    const { account, reclaimed, code } = registered;
    const emailSent = await deliverCode(deps, {
      purpose: 'verify_email',
      to: input.email,
      fullName: input.fullName,
      code,
      ttlSeconds: config.emailCodeTtlSeconds,
    });
    if (emailSent) {
      try {
        await insertAccessLog(pool, { event: 'email_code_sent', accountId: account.id, deviceId: null, ...ctx });
      } catch (err) {
        // A conta acabou de ser SUBSTITUÍDA por outro cadastro do mesmo e-mail (I-4): o vínculo da trilha não existe mais. O cadastro vale.
        if ((err as { code?: string }).code !== '23503') throw err;
      }
    }
    return { kind: 'ok', account, emailSent, resendAfterSeconds: config.emailCodeMinIntervalSeconds, reclaimed };
  }
  throw new Error('unreachable');
}

let dummyHash: Promise<string> | null = null;
/** Hash descartável para gastar o mesmo tempo de bcrypt quando a conta não existe. */
export function getDummyHash(cost: number): Promise<string> {
  dummyHash ??= bcrypt.hash(newOpaqueToken(), cost);
  return dummyHash;
}

export async function login(
  pool: Pool,
  config: AuthConfig,
  input: { accountType: AccountType; identifier: string; password: string; device?: DeviceInput | undefined },
  ctx: RequestContext,
): Promise<LoginResult> {
  const identifier = normalizeIdentifier(input.identifier);
  // Par tipo + identificador + IP (escopo pelo TIPO: errar a senha do passageiro não atrasa o motorista de mesmo
  // e-mail). A espera progressiva é do PAR: quem erra paga no próprio par, e a vítima (outro IP) entra sem espera.
  const pairHash = hmacHex(config.pepper, `${input.accountType}:${identifier.value}|ip:${ctx.ipHash ?? '-'}`);

  const gate = await reserveDelayedAttempt(pool, {
    scope: 'login',
    identifierHash: pairHash,
    ipHash: ctx.ipHash,
    schedule: config.loginDelay,
    memoryHours: LOGIN_FAILURE_MEMORY_HOURS,
  });
  if (!gate.allowed) {
    await insertAccessLog(pool, { event: 'login_blocked', accountId: null, deviceId: null, ...ctx });
    return { kind: 'blocked', retryAfterSeconds: gate.retryAfterSeconds };
  }

  const candidate = await findLoginCandidate(pool, input.accountType, identifier);
  // Compara SEMPRE, mesmo sem conta: o tempo de resposta não revela se o e-mail existe.
  const passwordOk = await bcrypt.compare(input.password, candidate?.passwordHash ?? (await getDummyHash(config.bcryptCost)));

  if (!candidate || !passwordOk || candidate.status !== 'active') {
    await insertAccessLog(pool, { event: 'login_failure', accountId: candidate?.account.id ?? null, deviceId: null, ...ctx });
    return { kind: 'invalid_credentials' };
  }

  // Senha certa, e-mail não verificado: NUNCA sessão. (Só quem provou a senha vê este desfecho.)
  if (!candidate.emailVerified) {
    await recordLoginSuccess(pool, [pairHash], ctx.ipHash);
    await insertAccessLog(pool, { event: 'login_failure', accountId: candidate.account.id, deviceId: null, ...ctx });
    return { kind: 'email_not_verified' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await recordLoginSuccess(client, [pairHash], ctx.ipHash);
    const session = await openSession(client, config, candidate.account, input.device, ctx);
    await client.query('COMMIT');
    return { kind: 'ok', session };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Renovação. Só `rotated` devolve token; tudo o mais é o MESMO `invalid` (o cliente não distingue reuso de expirado). */
export async function refresh(pool: Pool, config: AuthConfig, refreshToken: string, ctx: RequestContext): Promise<RefreshResult> {
  const newToken = newOpaqueToken();
  const newHash = sha256Hex(newToken);
  const rotation = await rotateRefreshToken(pool, sha256Hex(refreshToken), newHash, new Date(Date.now() + config.refreshTtlMs));

  if (rotation.outcome === 'reuse_detected') {
    await insertAccessLog(pool, { event: 'token_reuse_detected', accountId: rotation.accountId, deviceId: rotation.deviceId, ...ctx });
    return { kind: 'invalid' };
  }
  if (rotation.outcome !== 'rotated' || !rotation.accountId || !rotation.familyId) return { kind: 'invalid' };

  const refreshExpiresAt = await getRefreshTokenExpiry(pool, newHash);
  await insertAccessLog(pool, { event: 'token_refresh', accountId: rotation.accountId, deviceId: rotation.deviceId, ...ctx });
  const access = issueAccessToken(config, rotation.accountId, rotation.familyId);
  return {
    kind: 'ok',
    tokens: {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken: newToken,
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
    },
  };
}

/** Encerra a sessão dona do token de renovação. Idempotente: token desconhecido/já revogado também dá certo. */
export async function logout(pool: Pool, refreshToken: string, ctx: RequestContext): Promise<void> {
  const revoked = await revokeFamilyByRefreshHash(pool, sha256Hex(refreshToken));
  if (revoked) await insertAccessLog(pool, { event: 'logout', accountId: revoked.accountId, deviceId: revoked.deviceId, ...ctx });
}

export async function logoutAll(pool: Pool, accountId: string, ctx: RequestContext): Promise<number> {
  const count = await revokeAllFamilies(pool, accountId);
  await insertAccessLog(pool, { event: 'logout_all', accountId, deviceId: null, ...ctx });
  return count;
}

export async function getAccount(pool: Pool, accountId: string): Promise<AccountSummary | null> {
  return findAccountById(pool, accountId);
}
