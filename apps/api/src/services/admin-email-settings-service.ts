/**
 * Regra de negócio da configuração SMTP do painel: ler (com a ORIGEM de cada
 * campo), salvar, remover a senha salva e enviar e-mail de teste.
 *
 * Auditoria em `admin_audit_log` nunca leva a senha — só "definida / removida
 * / mantida".
 *
 * Alterar o SMTP (salvar ou remover a senha) exige reautenticação (I-2): senha
 * atual + código TOTP do dono. Quem controla o SMTP recebe os códigos de
 * verificação e de redefinição de senha dos apps; um cookie de sessão roubado,
 * sozinho, não pode redirecioná-lo. Cada alteração gera auditoria E um alerta
 * estruturado no log (`email_settings_changed`) — um canal que não passa pelo
 * próprio SMTP alterado.
 */
import type { Pool } from 'pg';
import type { AdminUser } from '../domain/admin.js';
import type { TwoFactorConfig } from '../domain/two-factor.js';
import {
  missingFields,
  resolveEffective,
  summarize,
  type EffectiveSmtp,
  type FieldSource,
  type PanelSmtp,
  type SaveSettingsInput,
  type StepUpInput,
} from '../domain/email-settings.js';
import { readEnvSmtp, allowInsecureDev, type EnvSmtp } from '../lib/email-env.js';
import { encryptSecret } from '../lib/secret-box.js';
import { BlockedHostError, resolveSafeHost } from '../lib/smtp-host-guard.js';
import { insertAuditLog } from '../repositories/admin-audit-repository.js';
import { clearPanelPassword, findPanelSmtp, savePanelSmtp, type PasswordChange } from '../repositories/email-settings-repository.js';
import { verifyStepUp, type StepUpOutcome } from './admin-two-factor-service.js';
import { EmailDeliveryError, EmailNotConfiguredError, SMTP_PASSWORD_AAD, type Mailer } from './mailer.js';

export const TEST_EMAIL_LIMIT_PER_HOUR = 5;

export interface EmailSettingsView {
  readonly fields: {
    readonly host: { readonly value: string | null; readonly source: FieldSource };
    readonly port: { readonly value: number | null; readonly source: FieldSource };
    readonly user: { readonly value: string | null; readonly source: FieldSource };
    readonly from: { readonly value: string | null; readonly source: FieldSource };
    readonly password: { readonly saved: boolean; readonly source: FieldSource };
  };
  /** Valor gravado no painel por campo (`null` = em branco no painel) — é o que o formulário pré-preenche. */
  readonly panel: { readonly host: string | null; readonly port: number | null; readonly user: string | null; readonly from: string | null; readonly passwordSaved: boolean };
  readonly configured: boolean;
  readonly missing: readonly string[];
  readonly summary: string | null;
  readonly updatedAt: string | null;
  /** `false` quando a chave de cifra não está no servidor: salvar senha no painel não funciona. */
  readonly canStorePassword: boolean;
}

function toView(effective: EffectiveSmtp, panel: PanelSmtp, canStorePassword: boolean): EmailSettingsView {
  const missing = missingFields(effective);
  return {
    fields: {
      host: effective.host,
      port: effective.port,
      user: effective.user,
      from: effective.from,
      password: effective.password,
    },
    panel: { host: panel.host, port: panel.port, user: panel.user, from: panel.from, passwordSaved: panel.hasPassword },
    configured: missing.length === 0,
    missing,
    summary: summarize(effective),
    updatedAt: panel.updatedAt,
    canStorePassword,
  };
}

/** Onde o alerta de alteração do SMTP é escrito (o logger da requisição). Nunca recebe valor de campo nem senha. */
export interface AlertLog {
  warn(obj: Record<string, unknown>): void;
}

export interface EmailSettingsContext {
  readonly encryptionKey: Buffer | null;
  readonly ipAddress: string | null;
  readonly readEnv?: () => EnvSmtp;
  readonly insecureDev?: () => boolean;
  /** Configuração do 2FA — a reautenticação (I-2) precisa da chave dos segredos TOTP. */
  readonly twoFactor?: TwoFactorConfig;
  readonly log?: AlertLog;
}

export type StepUpFailure = Exclude<StepUpOutcome, { kind: 'ok' }>;

/** Sem configuração de 2FA no contexto não há como reautenticar: falha fechada, igual a "sem chave". */
function runStepUp(pool: Pool, admin: AdminUser, stepUp: StepUpInput, context: EmailSettingsContext, purpose: string): Promise<StepUpOutcome> {
  if (!context.twoFactor) return Promise.resolve({ kind: 'two_factor_unavailable' });
  return verifyStepUp(pool, admin, stepUp, { ipAddress: context.ipAddress }, context.twoFactor, purpose);
}

const SENSITIVE_FIELDS = ['host', 'port', 'user', 'from'] as const;

/** Nomes (nunca valores) do que mudou entre o antes e o depois. */
function changedFieldNames(before: PanelSmtp, after: PanelSmtp, passwordChange: string): string[] {
  const changed: string[] = SENSITIVE_FIELDS.filter((field) => before[field] !== after[field]);
  if (passwordChange !== 'unchanged') changed.push('password');
  return changed;
}

export async function getEmailSettings(pool: Pool, context: Pick<EmailSettingsContext, 'encryptionKey' | 'readEnv'>): Promise<EmailSettingsView> {
  const panel = await findPanelSmtp(pool);
  return toView(resolveEffective(panel, (context.readEnv ?? readEnvSmtp)()), panel, context.encryptionKey !== null);
}

export type SaveOutcome =
  | { readonly kind: 'saved'; readonly view: EmailSettingsView }
  /** A reautenticação falhou (senha, código, bloqueio ou chave ausente): NADA foi gravado. */
  | { readonly kind: 'step_up_failed'; readonly failure: StepUpFailure }
  /** Há senha para gravar mas o servidor não tem chave de cifra. */
  | { readonly kind: 'encryption_unavailable' }
  | { readonly kind: 'host_blocked' };

export async function saveEmailSettings(pool: Pool, admin: AdminUser, input: SaveSettingsInput, context: EmailSettingsContext): Promise<SaveOutcome> {
  // Reautenticação ANTES de qualquer outra coisa (inclusive a consulta de DNS): sem ela, nada acontece.
  const stepUp = await runStepUp(pool, admin, input.stepUp, context, 'email_settings.update');
  if (stepUp.kind !== 'ok') return { kind: 'step_up_failed', failure: stepUp };

  const insecureDev = (context.insecureDev ?? allowInsecureDev)();

  // Falha cedo: não grava um host que o envio recusaria. DNS que não resolve ainda passa (o dono pode estar criando o registro).
  if (input.host !== null) {
    try {
      await resolveSafeHost(input.host, insecureDev);
    } catch (err) {
      if (err instanceof BlockedHostError) return { kind: 'host_blocked' };
      // Não resolve: aceita; o teste mostrará o erro.
    }
  }

  let password: PasswordChange = { kind: 'keep' };
  // Sem servidor no painel, a senha do painel não vale para nada: volta ao ambiente junto com ele (I-1).
  if (input.clearPassword || input.host === null) password = { kind: 'clear' };
  else if (input.password) {
    if (!context.encryptionKey) return { kind: 'encryption_unavailable' };
    password = { kind: 'set', encrypted: encryptSecret(input.password, context.encryptionKey, SMTP_PASSWORD_AAD) };
  }

  const before = await findPanelSmtp(pool);
  const after = await savePanelSmtp(pool, { host: input.host, port: input.port, user: input.user, from: input.from, password, adminId: admin.id });

  const passwordChange = password.kind === 'set' ? 'set' : password.kind === 'clear' && before.hasPassword ? 'cleared' : 'unchanged';
  const changedFields = changedFieldNames(before, after, passwordChange);
  await insertAuditLog(pool, {
    adminId: admin.id,
    action: 'email_settings.updated',
    targetType: 'email_settings',
    targetId: '1',
    // Nunca a senha: só se mudou.
    before: { host: before.host, port: before.port, user: before.user, from: before.from, passwordSaved: before.hasPassword },
    after: {
      host: after.host,
      port: after.port,
      user: after.user,
      from: after.from,
      passwordSaved: after.hasPassword,
      passwordChange,
      changedFields,
      stepUp: 'password+totp',
    },
    ipAddress: context.ipAddress,
  });
  context.log?.warn({ event: 'email_settings_changed', adminId: admin.id, changedFields, passwordChange });

  return { kind: 'saved', view: toView(resolveEffective(after, (context.readEnv ?? readEnvSmtp)()), after, context.encryptionKey !== null) };
}

export type RemovePasswordOutcome =
  | { readonly kind: 'removed'; readonly view: EmailSettingsView }
  | { readonly kind: 'step_up_failed'; readonly failure: StepUpFailure };

export async function removeSavedPassword(pool: Pool, admin: AdminUser, stepUp: StepUpInput, context: EmailSettingsContext): Promise<RemovePasswordOutcome> {
  const gate = await runStepUp(pool, admin, stepUp, context, 'email_settings.password_remove');
  if (gate.kind !== 'ok') return { kind: 'step_up_failed', failure: gate };

  const removed = await clearPanelPassword(pool, admin.id);
  if (removed) {
    await insertAuditLog(pool, {
      adminId: admin.id,
      action: 'email_settings.password_removed',
      targetType: 'email_settings',
      targetId: '1',
      after: { passwordSaved: false, changedFields: ['password'], stepUp: 'password+totp' },
      ipAddress: context.ipAddress,
    });
    context.log?.warn({ event: 'email_settings_changed', adminId: admin.id, changedFields: ['password'], passwordChange: 'cleared' });
  }
  return { kind: 'removed', view: await getEmailSettings(pool, context) };
}

/**
 * Reserva uma tentativa de teste na janela de 1 hora. Conta no `admin_audit_log`
 * (já append-only) sob lock consultivo por admin: duas requisições simultâneas
 * não passam do limite juntas. Falha de SMTP também gasta tentativa — é o que
 * impede usar o teste como sonda.
 */
async function reserveTestAttempt(pool: Pool, adminId: string, ipAddress: string | null): Promise<{ reserved: true } | { reserved: false; retryAfterSeconds: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`email_settings.test:${adminId}`]);
    const recent = await client.query<{ created_at: Date }>(
      `SELECT created_at FROM admin_audit_log
       WHERE admin_id = $1 AND action = 'email_settings.test_requested' AND created_at > now() - interval '1 hour'
       ORDER BY created_at ASC`,
      [adminId],
    );
    if (recent.rows.length >= TEST_EMAIL_LIMIT_PER_HOUR) {
      await client.query('COMMIT');
      const oldest = recent.rows[0]!.created_at.getTime();
      return { reserved: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + 3_600_000 - Date.now()) / 1000)) };
    }
    await client.query(
      `INSERT INTO admin_audit_log (admin_id, action, target_type, target_id, ip_address) VALUES ($1, 'email_settings.test_requested', 'email_settings', '1', $2)`,
      [adminId, ipAddress],
    );
    await client.query('COMMIT');
    return { reserved: true };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export type TestOutcome =
  | { readonly kind: 'sent'; readonly to: string }
  | { readonly kind: 'rate_limited'; readonly retryAfterSeconds: number }
  | { readonly kind: 'not_configured'; readonly missing: readonly string[] }
  | { readonly kind: 'failed'; readonly error: EmailDeliveryError };

export async function sendTestEmail(pool: Pool, admin: AdminUser, to: string | undefined, context: EmailSettingsContext, mailer: Mailer): Promise<TestOutcome> {
  const reservation = await reserveTestAttempt(pool, admin.id, context.ipAddress);
  if (!reservation.reserved) return { kind: 'rate_limited', retryAfterSeconds: reservation.retryAfterSeconds };

  const recipient = to ?? admin.email;
  let outcome: TestOutcome;
  try {
    await mailer.send({
      to: recipient,
      subject: 'Teste de e-mail do VuumBora',
      text: 'Se você recebeu esta mensagem, o envio de e-mail do VuumBora está funcionando.\n\nEste é um teste disparado pelo painel administrativo.',
    });
    outcome = { kind: 'sent', to: recipient };
  } catch (err) {
    if (err instanceof EmailNotConfiguredError) outcome = { kind: 'not_configured', missing: err.missing };
    else if (err instanceof EmailDeliveryError) outcome = { kind: 'failed', error: err };
    else throw err;
  }

  await insertAuditLog(pool, {
    adminId: admin.id,
    action: 'email_settings.test_result',
    targetType: 'email_settings',
    targetId: '1',
    after: {
      result: outcome.kind,
      ...(outcome.kind === 'failed' ? { failureKind: outcome.error.kind, smtpCode: outcome.error.details.smtpCode ?? null, responseCode: outcome.error.details.responseCode ?? null } : {}),
    },
    ipAddress: context.ipAddress,
  });
  return outcome;
}
