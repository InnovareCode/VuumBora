import { z } from 'zod';
import { brazilianDateToIso } from '@vuumbora/ui';

/**
 * Validação de FORMATO das telas de conta — não é regra de negócio: quem decide é o servidor (`docs/contrato-
 * identidade-apps.md`), e cada recusa dele tem estado de tela próprio (`src/identity/authErrors.ts`). Aqui só se
 * evita ida e volta à toa com o que dá para ver no próprio aparelho, espelhando os limites do contrato:
 * senha de 8 caracteres a 72 BYTES, nome até 120, e-mail até 254, código de 6 dígitos, data real do calendário.
 * "Tem 18 anos?" e "a senha confere?" NÃO são checados aqui: são do servidor.
 */

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Tamanho em bytes UTF-8 (o limite de 72 do bcrypt é em bytes: "ação" gasta 6, um emoji gasta 4). */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const point = char.codePointAt(0) ?? 0;
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
  }
  return bytes;
}

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Informe seu e-mail.')
  .max(254, 'O e-mail é longo demais.')
  .refine((value) => z.email().safeParse(value).success, 'Informe um e-mail válido, como nome@exemplo.com.');

/** Senha NOVA (cadastro, redefinição): 8 caracteres ou mais, no máximo 72 bytes. */
const newPasswordSchema = z
  .string()
  .min(1, 'Crie uma senha.')
  .min(8, 'Use pelo menos 8 caracteres.')
  .refine((value) => utf8ByteLength(value) <= 72, 'Senha longa demais: use no máximo 72 caracteres (acentos e símbolos contam mais de um).');

const codeSchema = z
  .string()
  .trim()
  .min(1, 'Digite o código de 6 dígitos.')
  .regex(/^\d{6}$/, 'O código tem 6 dígitos.');

// ---- Login: e-mail OU ID público (celular NÃO) ----

export const loginSchema = z.object({
  // O formato do ID público é do servidor (não inventamos máscara): só exige que algo foi digitado.
  identifier: z.string().trim().min(1, 'Informe seu e-mail ou ID público.').max(254, 'O texto é longo demais.'),
  password: z.string().min(1, 'Informe sua senha.').max(256, 'A senha é longa demais.'),
});
export type LoginFormValues = z.infer<typeof loginSchema>;

// ---- Cadastro ----

export const cadastroSchema = z.object({
  fullName: z.string().trim().min(1, 'Informe seu nome completo.').max(120, 'Use no máximo 120 caracteres.'),
  email: emailSchema,
  // Opcional: vazio vale. Preenchido, precisa de DDD + número (a máscara já limita a 11 dígitos).
  phone: z
    .string()
    .refine((value) => value === '' || [10, 11].includes(digitsOnly(value).length), 'Celular inválido. Informe DDD + número.'),
  // DD/MM/AAAA digitado. A conversão para AAAA-MM-DD acontece no envio (`brazilianDateToIso`).
  birthDate: z
    .string()
    .min(1, 'Informe sua data de nascimento.')
    .refine((value) => brazilianDateToIso(value) !== null, 'Data inválida. Use dia/mês/ano, por exemplo 15/05/1990.'),
  password: newPasswordSchema,
  // O aceite nunca nasce marcado e cada documento tem o seu: marcar um não vale pelo outro.
  termsAccepted: z.boolean().refine((value) => value, 'Para criar a conta, aceite os Termos de Uso.'),
  privacyAccepted: z.boolean().refine((value) => value, 'Para criar a conta, aceite a Política de Privacidade.'),
});
export type CadastroFormValues = z.infer<typeof cadastroSchema>;

// ---- Código do e-mail + senha escolhida no cadastro (o servidor exige as duas) ----

export const verifySchema = z.object({
  code: codeSchema,
  password: z.string().min(1, 'Digite a senha que você escolheu no cadastro.').max(256, 'A senha é longa demais.'),
});
export type VerifyFormValues = z.infer<typeof verifySchema>;

// ---- Esqueci a senha / redefinir ----

export const forgotSchema = z.object({ email: emailSchema });
export type ForgotFormValues = z.infer<typeof forgotSchema>;

export const resetSchema = z.object({ code: codeSchema, newPassword: newPasswordSchema });
export type ResetFormValues = z.infer<typeof resetSchema>;
