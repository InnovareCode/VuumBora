import { z } from 'zod';

/**
 * Validação de FORMATO para os formulários de autenticação (login/cadastro) — não é
 * regra de negócio (isso seria do Vega/backend, quando existir). Mensagens em
 * português, usadas direto pelo React Hook Form via `zodResolver`.
 */

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

const brazilianPhoneSchema = z
  .string()
  .min(1, 'Informe seu celular.')
  .refine((value) => {
    const digits = digitsOnly(value);
    return digits.length === 10 || digits.length === 11;
  }, 'Celular inválido. Informe DDD + número.');

const passwordSchema = z
  .string()
  .min(1, 'Informe sua senha.')
  .min(6, 'A senha precisa ter pelo menos 6 caracteres.');

export const loginSchema = z.object({
  identifier: z
    .string()
    .min(1, 'Informe seu e-mail ou celular.')
    .refine((value) => {
      const digits = digitsOnly(value);
      const isPhone = digits.length === 10 || digits.length === 11;
      const isEmail = z.string().email().safeParse(value).success;
      return isPhone || isEmail;
    }, 'Informe um e-mail ou celular válido.'),
  password: passwordSchema,
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const cadastroSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Informe seu nome completo.')
    .min(3, 'O nome precisa ter pelo menos 3 letras.'),
  phone: brazilianPhoneSchema,
  email: z.string().min(1, 'Informe seu e-mail.').email('E-mail inválido.'),
  password: passwordSchema,
});

export type CadastroFormValues = z.infer<typeof cadastroSchema>;
