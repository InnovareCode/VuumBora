/**
 * Serviço de envio de e-mail. `Mailer` é a interface que a verificação de
 * e-mail e a recuperação de senha consomem; `createSmtpMailer` é a
 * implementação por SMTP (nodemailer).
 *
 * A configuração efetiva (painel > ambiente) é lida do banco A CADA envio:
 * salvar no painel vale na próxima mensagem, sem reiniciar. Sem SMTP
 * configurado o envio falha com `EmailNotConfiguredError` — nunca "finge que
 * enviou".
 *
 * Log: só `event`, `ok` e códigos. Nunca host, usuário, senha, destinatário.
 */
import { isIP } from 'node:net';
import nodemailer from 'nodemailer';
import type { Pool } from 'pg';
import { credentialOriginViolation, missingFields, parseMailbox, resolveEffective } from '../domain/email-settings.js';
import { allowInsecureDev, readEnvSmtp, type EnvSmtp } from '../lib/email-env.js';
import { decryptSecret } from '../lib/secret-box.js';
import { BlockedHostError, resolveSafeHost, UnresolvableHostError } from '../lib/smtp-host-guard.js';
import { findEncryptedPassword, findPanelSmtp } from '../repositories/email-settings-repository.js';

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

export interface Mailer {
  /** Resolve quando o servidor SMTP aceitou a mensagem. Rejeita com `EmailNotConfiguredError` ou `EmailDeliveryError`. */
  send(message: MailMessage): Promise<void>;
}

export class EmailNotConfiguredError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(`SMTP não configurado (faltam: ${missing.join(', ')})`);
    this.name = 'EmailNotConfiguredError';
  }
}

export type DeliveryFailureKind = 'blocked_host' | 'unresolvable_host' | 'password_unreadable' | 'smtp';

/** Falha de entrega, com o texto EXATO do servidor quando existe — é o que o dono precisa ver para corrigir. */
export class EmailDeliveryError extends Error {
  constructor(
    readonly kind: DeliveryFailureKind,
    message: string,
    readonly details: { readonly smtpCode?: string; readonly responseCode?: number; readonly command?: string } = {},
  ) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

export interface MailerLog {
  info(obj: Record<string, unknown>): void;
  warn(obj: Record<string, unknown>): void;
}

export interface SmtpMailerDeps {
  readonly pool: Pool;
  /** Chave que decifra a senha salva no painel; `null` = só funciona com senha vinda do ambiente. */
  readonly encryptionKey: Buffer | null;
  readonly log?: MailerLog;
  /** Injetáveis para teste; em produção leem `process.env`. */
  readonly readEnv?: () => EnvSmtp;
  readonly insecureDev?: () => boolean;
}

/** AAD da cifra da senha SMTP — separa o domínio desta cifra do TOTP, que usa a mesma chave com outro AAD. */
export const SMTP_PASSWORD_AAD = 'email_settings:smtp_password';

interface SendableConfig {
  readonly host: string;
  readonly hostFromPanel: boolean;
  readonly port: number;
  readonly user: string | null;
  readonly password: string | null;
  readonly from: string;
}

async function loadSendableConfig(deps: SmtpMailerDeps): Promise<SendableConfig> {
  const env = (deps.readEnv ?? readEnvSmtp)();
  const panel = await findPanelSmtp(deps.pool);
  const effective = resolveEffective(panel, env);
  const missing = missingFields(effective);
  if (missing.length > 0) throw new EmailNotConfiguredError(missing);
  // I-1: servidor, porta, usuário e senha têm UMA origem. Mista = recusa, nunca "manda a senha do ambiente para o host do painel".
  const mixed = credentialOriginViolation(effective);
  if (mixed !== null) throw new EmailNotConfiguredError([mixed]);

  let password: string | null = null;
  if (effective.password.source === 'panel') {
    const encrypted = await findEncryptedPassword(deps.pool);
    if (encrypted === null) throw new EmailNotConfiguredError(['password']); // removida entre as duas leituras
    if (!deps.encryptionKey) throw new EmailDeliveryError('password_unreadable', 'Chave de cifra ausente: não dá para ler a senha salva.');
    try {
      password = decryptSecret(encrypted, deps.encryptionKey, SMTP_PASSWORD_AAD);
    } catch {
      throw new EmailDeliveryError('password_unreadable', 'A senha salva não pôde ser lida (chave de cifra trocada?). Salve a senha de novo.');
    }
  } else if (effective.password.source === 'env') {
    password = env.password;
  }

  return {
    host: effective.host.value!,
    hostFromPanel: effective.host.source === 'panel',
    port: effective.port.value!,
    user: effective.user.value,
    password,
    from: effective.from.value!,
  };
}

/** Tira a senha de qualquer texto que vá para quem chamou (defesa extra: servidor que ecoa credencial). */
function redact(text: string, password: string | null): string {
  return password && password.length >= 3 ? text.split(password).join('***') : text;
}

interface NodemailerError {
  message?: unknown;
  code?: unknown;
  responseCode?: unknown;
  command?: unknown;
  response?: unknown;
}

function toDeliveryError(err: unknown, password: string | null): EmailDeliveryError {
  const e = (typeof err === 'object' && err !== null ? err : {}) as NodemailerError;
  // `message` já traz a resposta do servidor (ex.: "Invalid login: 535 5.7.8 ..."); `response` é a linha crua.
  const text = typeof e.message === 'string' && e.message ? e.message : 'Falha ao falar com o servidor SMTP.';
  return new EmailDeliveryError('smtp', redact(text, password), {
    ...(typeof e.code === 'string' ? { smtpCode: e.code } : {}),
    ...(typeof e.responseCode === 'number' ? { responseCode: e.responseCode } : {}),
    ...(typeof e.command === 'string' ? { command: e.command } : {}),
  });
}

export function createSmtpMailer(deps: SmtpMailerDeps): Mailer {
  return {
    async send(message) {
      const config = await loadSendableConfig(deps);
      const insecureDev = (deps.insecureDev ?? allowInsecureDev)();

      // Host do painel é entrada do usuário: passa pela trava de SSRF e conectamos ao IP aprovado.
      // Host do ambiente é do operador do servidor — confiável (pode ser um relay interno).
      let connectHost = config.host;
      if (config.hostFromPanel) {
        try {
          connectHost = await resolveSafeHost(config.host, insecureDev);
        } catch (err) {
          if (err instanceof BlockedHostError) throw new EmailDeliveryError('blocked_host', 'Este servidor aponta para uma rede interna ou endereço reservado e não é permitido.');
          if (err instanceof UnresolvableHostError) throw new EmailDeliveryError('unresolvable_host', 'Não foi possível resolver o endereço do servidor SMTP.');
          throw err;
        }
      }

      const secure = config.port === 465;
      const transport = nodemailer.createTransport({
        host: connectHost,
        port: config.port,
        secure,
        // Com credencial, STARTTLS é obrigatório: sem isto um intermediário removeria o "STARTTLS" da lista e levaria a senha em claro.
        requireTLS: !secure && !insecureDev,
        ...(config.user !== null ? { auth: { user: config.user, pass: config.password ?? '' } } : {}),
        tls: { ...(isIP(config.host) ? {} : { servername: config.host }), minVersion: 'TLSv1.2' },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
        // Sem pool nem reuso: cada envio relê a configuração e abre a própria conexão.
      });

      // `from` já foi validado ao salvar, mas o do ambiente não: valida de novo antes de montar o cabeçalho.
      const mailbox = parseMailbox(config.from);
      if (!mailbox) throw new EmailNotConfiguredError(['from']);

      try {
        await transport.sendMail({
          from: mailbox.name ? { name: mailbox.name, address: mailbox.address } : mailbox.address,
          to: message.to,
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        });
        deps.log?.info({ event: 'email_sent', ok: true });
      } catch (err) {
        const failure = toDeliveryError(err, config.password);
        deps.log?.warn({ event: 'email_send_failed', ok: false, kind: failure.kind, smtpCode: failure.details.smtpCode, responseCode: failure.details.responseCode });
        throw failure;
      } finally {
        transport.close();
      }
    },
  };
}
