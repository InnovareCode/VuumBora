/**
 * Regra pura da configuração SMTP: validação dos campos e composição do valor
 * efetivo (painel > ambiente > nada). Sem I/O — testável sem banco.
 */
import { z } from 'zod';
import type { EnvSmtp } from '../lib/email-env.js';

export type FieldSource = 'panel' | 'env' | 'unset';

/** O que está gravado no painel. `null` = campo em branco (volta ao ambiente). */
export interface PanelSmtp {
  readonly host: string | null;
  readonly port: number | null;
  readonly user: string | null;
  readonly from: string | null;
  readonly hasPassword: boolean;
  readonly updatedAt: string | null;
}

export interface EffectiveField<T> {
  readonly value: T | null;
  readonly source: FieldSource;
}

export interface EffectiveSmtp {
  readonly host: EffectiveField<string>;
  readonly port: EffectiveField<number>;
  readonly user: EffectiveField<string>;
  readonly from: EffectiveField<string>;
  /** A senha nunca tem `value`: só se existe e de onde vem. */
  readonly password: { readonly saved: boolean; readonly source: FieldSource };
}

/** Portas SMTP legítimas. Restringir a porta do host digitado no painel limita o teste a "falar SMTP", não a sondar qualquer serviço. */
export const ALLOWED_PANEL_PORTS: readonly number[] = [25, 465, 587, 2525];

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const IPV6_LITERAL = /^[0-9a-f:.]+$/i;

export function isValidHost(host: string): boolean {
  if (host.includes(':')) return host.length <= 45 && IPV6_LITERAL.test(host);
  return HOSTNAME.test(host);
}

export interface Mailbox {
  readonly name: string | null;
  readonly address: string;
}

const ADDRESS = /^[^\s<>"(),;:\\@]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const NAMED = /^([^<>"\r\n\\]{1,80}?)\s*<([^<>\s]+)>$/;

/** Aceita `Nome <a@b.com>` ou `a@b.com`. Recusa quebra de linha e aspas (injeção de cabeçalho). */
export function parseMailbox(raw: string): Mailbox | null {
  const text = raw.trim();
  if (text.length === 0 || text.length > 200) return null;
  const named = NAMED.exec(text);
  if (named) {
    const address = named[2]!;
    const name = named[1]!.trim();
    return ADDRESS.test(address) && name.length > 0 ? { name, address } : null;
  }
  return ADDRESS.test(text) ? { name: null, address: text } : null;
}

export function isValidAddress(value: string): boolean {
  return ADDRESS.test(value);
}

/** Em branco (ou só espaços) vira `null`: é assim que o painel "devolve o campo ao ambiente". */
const blankToNull = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? null : value);
const noControlChars = (value: string) => !/[\u0000-\u001f\u007f]/.test(value);

const hostField = z.preprocess(
  blankToNull,
  z.string().trim().refine(isValidHost, 'Informe só o endereço do servidor, sem http://, porta ou barra.').nullable(),
);
const portField = z.preprocess(
  blankToNull,
  z.union([
    z.null(),
    z.coerce
      .number()
      .int()
      .refine((p) => ALLOWED_PANEL_PORTS.includes(p), `Porta deve ser uma de ${ALLOWED_PANEL_PORTS.join(', ')}.`),
  ]),
);
const userField = z.preprocess(blankToNull, z.string().trim().min(1).max(254).refine(noControlChars, 'Caractere inválido.').nullable());
const fromField = z.preprocess(
  blankToNull,
  z
    .string()
    .trim()
    .refine((v) => parseMailbox(v) !== null, 'Remetente inválido. Use "Nome <email@dominio>" ou "email@dominio".')
    .nullable(),
);

/**
 * Reautenticação exigida para alterar o SMTP (revisão S1 rodada 2, I-2): a
 * senha ATUAL do dono e um código TOTP dele. O nome é `stepUp` (e não
 * `password`) porque `password`, neste corpo, é a senha do servidor SMTP.
 */
export const stepUpSchema = z
  .object({
    password: z.string().min(1).max(200),
    code: z.string().trim().min(6).max(32),
  })
  .strict();

export type StepUpInput = z.infer<typeof stepUpSchema>;

/**
 * Corpo de "salvar". Os quatro campos de texto descrevem o estado inteiro do
 * formulário: ausente, `""` ou `null` limpa o valor do painel (volta ao
 * ambiente). Senha: ausente/`""` = mantém a salva; texto = troca;
 * `clearPassword` = remove.
 *
 * Servidor, porta, usuário e senha são UMA unidade de origem (I-1): ou vêm
 * todos do painel ou todos do ambiente. Por isso, sem `host` no painel, não se
 * aceita porta, usuário nem senha do painel (só o remetente é independente);
 * com `host`, a porta é obrigatória (nunca "a porta do ambiente").
 */
export const saveSettingsSchema = z
  .object({
    host: hostField.default(null),
    port: portField.default(null),
    user: userField.default(null),
    from: fromField.default(null),
    password: z.string().max(512).refine(noControlChars, 'Caractere inválido.').optional(),
    clearPassword: z.boolean().optional(),
    stepUp: stepUpSchema,
  })
  .strict()
  .refine((v) => !(v.clearPassword && v.password), { message: 'Envie a senha nova OU clearPassword, não os dois.', path: ['password'] })
  .superRefine((v, ctx) => {
    if (v.host === null) {
      if (v.port !== null) ctx.addIssue({ code: 'custom', message: 'A porta do painel só vale junto com um servidor do painel.', path: ['port'] });
      if (v.user !== null) ctx.addIssue({ code: 'custom', message: 'O usuário do painel só vale junto com um servidor do painel.', path: ['user'] });
      if (v.password) ctx.addIssue({ code: 'custom', message: 'A senha do painel só vale junto com um servidor do painel.', path: ['password'] });
    } else if (v.port === null) {
      ctx.addIssue({ code: 'custom', message: 'Informe a porta do servidor.', path: ['port'] });
    }
  });

export type SaveSettingsInput = z.infer<typeof saveSettingsSchema>;

/** Corpo de "remover senha salva": só a reautenticação. */
export const removePasswordSchema = z.object({ stepUp: stepUpSchema }).strict();

export const testEmailSchema = z
  .object({ to: z.string().trim().max(254).refine(isValidAddress, 'E-mail de destino inválido.').optional() })
  .strict();

function pick<T>(panel: T | null, env: T | null): EffectiveField<T> {
  if (panel !== null) return { value: panel, source: 'panel' };
  if (env !== null) return { value: env, source: 'env' };
  return { value: null, source: 'unset' };
}

/** Só o que vem da origem `origin`; o que falta nela fica "não definido" (nunca cai na outra origem). */
function only<T>(origin: 'panel' | 'env', value: T | null): EffectiveField<T> {
  return value === null ? { value: null, source: 'unset' } : { value, source: origin };
}

/**
 * Valor efetivo. O remetente é independente (painel > ambiente). Servidor,
 * porta, usuário e SENHA formam uma unidade: a origem de todos é a do servidor
 * (revisão S1 rodada 2, I-1). Sem isso, um `host` digitado no painel com a
 * senha `SMTP_PASS` do ambiente faria o servidor enviar a credencial da
 * infraestrutura a um endereço escolhido pelo dono do painel.
 */
export function resolveEffective(panel: PanelSmtp, env: EnvSmtp): EffectiveSmtp {
  const origin: 'panel' | 'env' = panel.host !== null ? 'panel' : 'env';
  const connection = origin === 'panel'
    ? { host: panel.host, port: panel.port, user: panel.user, hasPassword: panel.hasPassword }
    : { host: env.host, port: env.port, user: env.user, hasPassword: env.password !== null };
  return {
    host: only(origin, connection.host),
    port: only(origin, connection.port),
    user: only(origin, connection.user),
    from: pick(panel.from, env.from),
    password: { saved: connection.hasPassword, source: connection.hasPassword ? origin : 'unset' },
  };
}

/**
 * Trava no ponto de uso: `null` se servidor, porta, usuário e senha têm a mesma
 * origem; senão, o nome do campo que destoa. O envio recusa a configuração
 * mista mesmo que o resolvedor acima regrida.
 */
export function credentialOriginViolation(effective: EffectiveSmtp): string | null {
  const origin = effective.host.source;
  if (origin === 'unset') return null;
  const mixed = (source: FieldSource): boolean => source !== 'unset' && source !== origin;
  if (mixed(effective.port.source)) return 'port';
  if (mixed(effective.user.source)) return 'user';
  if (mixed(effective.password.source)) return 'password';
  return null;
}

/** Campos sem os quais não dá para enviar. */
export function missingFields(effective: EffectiveSmtp): string[] {
  const missing: string[] = [];
  if (effective.host.value === null) missing.push('host');
  if (effective.port.value === null) missing.push('port');
  if (effective.from.value === null) missing.push('from');
  if (effective.user.value !== null && !effective.password.saved) missing.push('password');
  return missing;
}

/** "Enviando por host:porta como Nome <remetente>" — ou `null` se não dá para enviar. */
export function summarize(effective: EffectiveSmtp): string | null {
  if (missingFields(effective).length > 0) return null;
  return `Enviando por ${effective.host.value}:${effective.port.value} como ${effective.from.value}`;
}
