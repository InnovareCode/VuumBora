/** Entrega dos e-mails da identidade via `MailPort`, com teto de tempo. Nunca loga mensagem nem destinatário. */
import { withTimeout } from '../lib/background-tasks.js';
import type { EmailCodePurpose } from '../lib/email-code.js';
import { buildCodeMail, buildPasswordChangedMail } from '../lib/identity-mail.js';
import type { MailMessage, MailPort } from '../lib/mail-port.js';

const MAIL_TIMEOUT_MS = 10_000;

/** O que estava sendo enviado quando falhou (vai para o log como rótulo; nunca o conteúdo). */
export type MailKind = EmailCodePurpose | 'password_changed_notice';

export interface MailDeps {
  readonly mail: MailPort;
  /** Chamado com a falha do envio (a rota loga só nome/código do erro, nunca mensagem). */
  readonly onMailFailure: (kind: MailKind, err: unknown) => void;
}

/** `true` se o provedor aceitou; `false` (e `onMailFailure`) em qualquer falha. Nunca lança. */
async function deliver(deps: MailDeps, kind: MailKind, message: MailMessage): Promise<boolean> {
  try {
    await withTimeout(deps.mail.send(message), MAIL_TIMEOUT_MS);
    return true;
  } catch (err) {
    deps.onMailFailure(kind, err);
    return false;
  }
}

export function deliverCode(
  deps: MailDeps,
  input: { purpose: EmailCodePurpose; to: string; fullName: string; code: string; ttlSeconds: number },
): Promise<boolean> {
  return deliver(deps, input.purpose, buildCodeMail(input));
}

/** Aviso "sua senha foi alterada" (I-7), depois de uma redefinição bem-sucedida. */
export function deliverPasswordChangedNotice(deps: MailDeps, input: { to: string; fullName: string }): Promise<boolean> {
  return deliver(deps, 'password_changed_notice', buildPasswordChangedMail(input));
}
