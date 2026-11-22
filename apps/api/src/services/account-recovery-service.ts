/**
 * Códigos de e-mail: verificar e-mail, reenviar código, "esqueci a senha" e
 * redefinir senha. Regras que valem o cuidado de quem revisa:
 *  - reenvio e "esqueci a senha" respondem IGUAL exista a conta ou não (o envio
 *    roda em segundo plano para o tempo não revelar nada) — o único vazamento
 *    deliberado é o do cadastro (decisão do dono);
 *  - o código em claro só existe em memória entre gerar e enviar: banco e log
 *    só veem o HMAC (com pepper, amarrado à finalidade e à conta);
 *  - a regra de tentativas/uso único/validade mora no banco (0014); aqui se
 *    chama a função, que não levanta exceção nas recusas;
 *  - verificar o e-mail exige o código E a senha do cadastro (I-4b); senha errada = código errado, sem oráculo;
 *  - redefinir troca a senha e revoga TODAS as sessões na mesma transação do
 *    banco, NÃO marca o e-mail como verificado e avisa o titular por e-mail (I-7);
 *  - as falhas de código de redefinição se somam por conta em 24 h (teto cumulativo, 0018): atingido,
 *    nem o código certo vale e nenhum código novo é emitido (I-7);
 *  - os limites de envio usam o e-mail CANONICAL (sem `+tag`, sem pontos do Gmail), o balde de IP e um
 *    teto global por hora (I-5).
 */
import type { Pool } from 'pg';
import type { AccountType } from '../domain/auth.js';
import { normalizeIdentifier } from '../domain/auth.js';
import type { AuthConfig } from '../lib/auth-config.js';
import { appBcrypt, assertAppBcryptCapacity } from '../lib/bcrypt-pool.js';
import { runInBackground } from '../lib/background-tasks.js';
import { emailGlobalKey } from '../lib/email-budget.js';
import { generateEmailCode, hashEmailCode, type EmailCodePurpose } from '../lib/email-code.js';
import { canonicalEmailForLimit } from '../lib/email-normalize.js';
import { hmacHex } from '../lib/token-crypto.js';
import { consumeEmailCode, findCodeTarget, issueEmailCode, resetPasswordWithCode, type CodeTarget, type ConsumeResult } from '../repositories/email-code-repository.js';
import { findPasswordHash, insertAccessLog, reserveAttempts, type AttemptKey } from '../repositories/identity-repository.js';
import { deliverCode, deliverPasswordChangedNotice, type MailDeps } from './code-delivery.js';
import { getDummyHash, type RequestContext } from './identity-service.js';

export type RequestCodeResult = { kind: 'accepted'; resendAfterSeconds: number } | { kind: 'blocked' };

export type CodeCheckResult =
  | { kind: 'ok' }
  | { kind: 'invalid'; attemptsLeft: number }
  | { kind: 'locked' }
  /** Teto cumulativo de falhas de redefinição do dia atingido (I-7): pedir outro código não adianta. */
  | { kind: 'account_locked' }
  /** Expirado, inexistente, já usado OU conta desconhecida: o cliente não distingue (e deve pedir outro código). */
  | { kind: 'expired' }
  /**
   * O PAR (tipo + identificador + IP) passou do limite de conferências da janela (A-1, rodada 3): nada foi
   * comparado nem gasto do código. `retryAfterSeconds` = a janela do limite.
   */
  | { kind: 'blocked'; retryAfterSeconds: number };

function toCheckResult(result: ConsumeResult): CodeCheckResult {
  switch (result.outcome) {
    case 'ok': return { kind: 'ok' };
    case 'invalid': return { kind: 'invalid', attemptsLeft: result.attemptsLeft };
    case 'locked': return { kind: 'locked' };
    case 'account_locked': return { kind: 'account_locked' };
    default: return { kind: 'expired' };
  }
}

/**
 * Limite dos PEDIDOS de código (escopo `code_request`): por (finalidade + tipo + alvo), por IP e o teto GLOBAL
 * de e-mails da classe. Alvo que é e-mail entra pela forma canonical (I-5c); ID público entra como veio.
 */
async function reserveCodeRequest(pool: Pool, config: AuthConfig, purpose: EmailCodePurpose, accountType: AccountType, target: { kind: 'email' | 'public_id'; value: string }, ctx: RequestContext): Promise<boolean> {
  const limitTarget = target.kind === 'email' ? canonicalEmailForLimit(target.value) : target.value;
  const keys: AttemptKey[] = [
    { identifierHash: hmacHex(config.pepper, `${purpose}:${accountType}:${limitTarget}`), max: config.codeRequestMaxPerIdentifier },
    emailGlobalKey(config, purpose),
  ];
  if (ctx.ipHash) keys.push({ identifierHash: hmacHex(config.pepper, `ip:${ctx.ipHash}`), max: config.codeRequestMaxPerIp });
  return reserveAttempts(pool, { scope: 'code_request', keys, ipHash: ctx.ipHash, windowMinutes: config.codeRequestWindowMinutes });
}

/**
 * Limite das CONFERÊNCIAS de código (verificar e-mail, redefinir senha), reservado ANTES do bcrypt (A-1, rodada 3):
 * por (finalidade + tipo + alvo + balde de IP), o mesmo "par" do login. Escopo `code_request` do banco com chave de
 * prefixo próprio (`code_check`): não se mistura com a contagem dos pedidos de código. Toda tentativa conta, mesmo
 * a que acerta, e o bloqueio não grava nada (não se alonga sozinho).
 */
async function reserveCodeCheck(pool: Pool, config: AuthConfig, purpose: EmailCodePurpose, accountType: AccountType, target: { kind: 'email' | 'public_id'; value: string }, ctx: RequestContext): Promise<boolean> {
  const limitTarget = target.kind === 'email' ? canonicalEmailForLimit(target.value) : target.value;
  const pair = hmacHex(config.pepper, `code_check:${purpose}:${accountType}:${limitTarget}|ip:${ctx.ipHash ?? '-'}`);
  return reserveAttempts(pool, {
    scope: 'code_request',
    keys: [{ identifierHash: pair, max: config.codeCheckMaxPerPair }],
    ipHash: ctx.ipHash,
    windowMinutes: config.codeCheckWindowMinutes,
  });
}

/** Emite o código para a conta e, se foi emitido, agenda o envio em segundo plano. Silencioso nos demais desfechos. */
async function issueAndSend(
  pool: Pool,
  config: AuthConfig,
  deps: MailDeps,
  purpose: EmailCodePurpose,
  account: CodeTarget,
  ctx: RequestContext,
): Promise<void> {
  const code = generateEmailCode();
  const issued = await issueEmailCode(pool, {
    accountId: account.id,
    purpose,
    codeHash: hashEmailCode(config.pepper, purpose, account.id, code),
    ttlSeconds: config.emailCodeTtlSeconds,
    minIntervalSeconds: config.emailCodeMinIntervalSeconds,
    maxPerHour: config.emailCodeMaxPerHour,
    maxResetFailures: purpose === 'password_reset' ? config.resetMaxFailuresPerDay : null,
  });
  if (issued.outcome !== 'issued') return;
  await insertAccessLog(pool, {
    event: purpose === 'verify_email' ? 'email_code_sent' : 'password_reset_requested',
    accountId: account.id,
    deviceId: null,
    ...ctx,
  });
  runInBackground(
    async () => {
      await deliverCode(deps, { purpose, to: account.email, fullName: account.fullName, code, ttlSeconds: config.emailCodeTtlSeconds });
    },
    (err) => deps.onMailFailure(purpose, err),
  );
}

/** Reenvia o código de verificação. Resposta idêntica para conta inexistente, já verificada, bloqueada ou fora do intervalo. */
export async function requestVerificationCode(
  pool: Pool, config: AuthConfig, deps: MailDeps,
  input: { accountType: AccountType; identifier: string }, ctx: RequestContext,
): Promise<RequestCodeResult> {
  const identifier = normalizeIdentifier(input.identifier);
  if (!(await reserveCodeRequest(pool, config, 'verify_email', input.accountType, identifier, ctx))) return { kind: 'blocked' };
  const account = await findCodeTarget(pool, input.accountType, identifier);
  if (account) await issueAndSend(pool, config, deps, 'verify_email', account, ctx);
  return { kind: 'accepted', resendAfterSeconds: config.emailCodeMinIntervalSeconds };
}

/** "Esqueci a senha" (só por e-mail). Resposta idêntica exista a conta ou não, e para conta não verificada. */
export async function requestPasswordReset(
  pool: Pool, config: AuthConfig, deps: MailDeps,
  input: { accountType: AccountType; email: string }, ctx: RequestContext,
): Promise<RequestCodeResult> {
  if (!(await reserveCodeRequest(pool, config, 'password_reset', input.accountType, { kind: 'email', value: input.email }, ctx))) return { kind: 'blocked' };
  const account = await findCodeTarget(pool, input.accountType, { kind: 'email', value: input.email });
  if (account) await issueAndSend(pool, config, deps, 'password_reset', account, ctx);
  return { kind: 'accepted', resendAfterSeconds: config.emailCodeMinIntervalSeconds };
}

/** Hash que nunca é o de um código real (64 hex zerados): gasta uma tentativa do código sem poder acertá-lo. */
const NEVER_A_CODE_HASH = '0'.repeat(64);

/**
 * Confere o código E a senha escolhida no cadastro; certo = e-mail verificado (a conta passa a poder abrir sessão pelo
 * login). A senha errada é tratada EXATAMENTE como um código errado — gasta uma das 5 tentativas do código e devolve o
 * mesmo desfecho (`invalid` com `attemptsLeft`, ou `locked`) —, então a rota não vira oráculo para adivinhar a senha de
 * uma conta pendente nem diz qual dos dois estava errado. O bcrypt roda SEMPRE (hash real ou descartável): o tempo não
 * revela se a conta existe. Sem isto (I-4b), quem sobrescrevesse um cadastro pendente com a senha DELE faria a vítima,
 * que só digita o código recebido por e-mail, verificar uma conta que ela não controla.
 */
export async function verifyEmail(
  pool: Pool, config: AuthConfig,
  input: { accountType: AccountType; identifier: string; code: string; password: string }, ctx: RequestContext,
): Promise<CodeCheckResult> {
  assertAppBcryptCapacity();
  const identifier = normalizeIdentifier(input.identifier);
  if (!(await reserveCodeCheck(pool, config, 'verify_email', input.accountType, identifier, ctx))) return { kind: 'blocked', retryAfterSeconds: config.codeCheckWindowMinutes * 60 };
  const account = await findCodeTarget(pool, input.accountType, identifier);
  const storedHash = account ? await findPasswordHash(pool, account.id) : null;
  const passwordOk = await appBcrypt().compare(input.password, storedHash ?? (await getDummyHash(config.bcryptCost)));
  if (!account) return { kind: 'expired' };
  const codeHash = passwordOk ? hashEmailCode(config.pepper, 'verify_email', account.id, input.code) : NEVER_A_CODE_HASH;
  const result = await consumeEmailCode(pool, account.id, 'verify_email', codeHash);
  if (result.outcome === 'ok') await insertAccessLog(pool, { event: 'email_verified', accountId: account.id, deviceId: null, ...ctx });
  return toCheckResult(result);
}

/** Redefine a senha com o código. Certo = senha trocada + todas as sessões revogadas (atômico no banco). */
export async function resetPassword(
  pool: Pool, config: AuthConfig, deps: MailDeps,
  input: { accountType: AccountType; email: string; code: string; newPassword: string }, ctx: RequestContext,
): Promise<CodeCheckResult> {
  // A reserva do par vem ANTES do bcrypt: sem ela, quem repete a rota ocupava a CPU sem limite por chave (A-1).
  assertAppBcryptCapacity();
  if (!(await reserveCodeCheck(pool, config, 'password_reset', input.accountType, { kind: 'email', value: input.email }, ctx))) return { kind: 'blocked', retryAfterSeconds: config.codeCheckWindowMinutes * 60 };
  // O bcrypt roda SEMPRE (inclusive para conta desconhecida): o tempo não revela se a conta existe.
  const newHash = await appBcrypt().hash(input.newPassword, config.bcryptCost);
  const account = await findCodeTarget(pool, input.accountType, { kind: 'email', value: input.email });
  if (!account) return { kind: 'expired' };
  const result = await resetPasswordWithCode(pool, account.id, hashEmailCode(config.pepper, 'password_reset', account.id, input.code), newHash, config.resetMaxFailuresPerDay);
  if (result.outcome === 'ok') {
    await insertAccessLog(pool, { event: 'password_changed', accountId: account.id, deviceId: null, ...ctx });
    await insertAccessLog(pool, { event: 'password_reset_completed', accountId: account.id, deviceId: null, ...ctx });
    // Aviso ao titular (I-7), em segundo plano: o tempo da resposta não muda e falha de e-mail não desfaz a troca.
    runInBackground(
      async () => {
        await deliverPasswordChangedNotice(deps, { to: account.email, fullName: account.fullName });
      },
      (err) => deps.onMailFailure('password_changed_notice', err),
    );
  }
  return toCheckResult(result);
}
