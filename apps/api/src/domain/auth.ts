/** Regras puras da identidade dos apps: validação de entrada e normalização. Sem I/O. */
import { z } from 'zod';
import { normalizeBrazilianPhone } from './phone.js';

/** Contas SEPARADAS (decisão do dono): um tipo por conta, nunca os dois. 'admin' não entra aqui. */
export type AccountType = 'passenger' | 'driver';
const accountTypeSchema = z.enum(['passenger', 'driver']);

const deviceSchema = z.object({
  installationId: z.string().min(8).max(128),
  platform: z.enum(['android', 'ios', 'web']),
  label: z.string().trim().max(80).optional(),
  appVersion: z.string().trim().max(40).optional(),
});
export type DeviceInput = z.infer<typeof deviceSchema>;

/** bcrypt só olha os primeiros 72 BYTES: acima disso, senhas diferentes colidiriam em silêncio. */
const passwordSchema = z
  .string()
  .min(8)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, { message: 'password_too_long' });

const emailSchema = z.string().trim().toLowerCase().min(3).max(254).email();
const identifierSchema = z.string().trim().min(1).max(254);
const codeSchema = z.string().trim().regex(/^[0-9]{6}$/);

/**
 * Cadastro. `birthDate` (`AAAA-MM-DD`, 18 anos completos — regra em `birth-date.ts`) e o aceite dos Termos de Uso e da
 * Política de Privacidade (`termsAccepted` e `privacyAccepted`, literalmente `true`) são OBRIGATÓRIOS.
 * A versão aceita NÃO vem do cliente: é a versão vigente da configuração do servidor.
 */
export const registerSchema = z.object({
  accountType: accountTypeSchema,
  fullName: z.string().trim().min(1).max(120),
  email: emailSchema,
  password: passwordSchema,
  phone: z.string().trim().max(32).optional(),
  birthDate: z.string().max(10),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true),
});

export const loginSchema = z.object({
  accountType: accountTypeSchema,
  identifier: identifierSchema,
  // Sem regra de força aqui: no login só importa não estourar o custo do bcrypt.
  password: z.string().min(1).max(256),
  device: deviceSchema.optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});

/**
 * Verificar o e-mail exige a SENHA escolhida no cadastro além do código (revisão S1 rodada 2, I-4b): quem sobrescreveu um
 * cadastro pendente com a senha DELE não faz a vítima, que só digita o código recebido, verificar uma conta que não é dela.
 */
export const verifyEmailSchema = z.object({ accountType: accountTypeSchema, identifier: identifierSchema, code: codeSchema, password: z.string().min(1).max(256) });
export const resendVerificationSchema = z.object({ accountType: accountTypeSchema, identifier: identifierSchema });
export const forgotPasswordSchema = z.object({ accountType: accountTypeSchema, email: emailSchema });
export const resetPasswordSchema = z.object({ accountType: accountTypeSchema, email: emailSchema, code: codeSchema, newPassword: passwordSchema });

/** E-mail (tem '@') vira minúsculo; ID público vira maiúsculo — mesma forma que o banco guarda. */
export function normalizeIdentifier(raw: string): { kind: 'email' | 'public_id'; value: string } {
  const trimmed = raw.trim();
  return trimmed.includes('@')
    ? { kind: 'email', value: trimmed.toLowerCase() }
    : { kind: 'public_id', value: trimmed.toUpperCase() };
}

/** Celular BR em E.164 ou `null` (campo opcional: inválido é erro do cliente, ausente não). */
export function normalizeOptionalPhone(raw: string | undefined): { ok: true; value: string | null } | { ok: false } {
  if (raw === undefined || raw === '') return { ok: true, value: null };
  const normalized = normalizeBrazilianPhone(raw);
  return normalized ? { ok: true, value: normalized } : { ok: false };
}

/** Só a FAMÍLIA do cliente (cabe em `access_log.user_agent_family`) — nunca o User-Agent inteiro. */
export function userAgentFamily(userAgent: string | undefined): string {
  const ua = (userAgent ?? '').toLowerCase();
  if (ua.includes('android') || ua.includes('okhttp')) return 'android';
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ios') || ua.includes('cfnetwork')) return 'ios';
  if (ua.includes('mozilla')) return 'web';
  return 'other';
}

export interface AccountSummary {
  readonly id: string;
  readonly publicId: string;
  readonly fullName: string;
  readonly accountType: AccountType;
}
