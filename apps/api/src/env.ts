/**
 * Carrega e valida variáveis de ambiente uma única vez, no boot. Falhar
 * rápido aqui evita um servidor no ar com `DATABASE_URL` vazio silencioso.
 */
import 'dotenv/config';
import { z } from 'zod';

// `dotenv/config` só lê um `.env` se ele existir no diretório de trabalho
// (uso local); em produção (Easypanel) não há arquivo — as variáveis já
// vêm injetadas direto no ambiente do contêiner, e o import acima é um
// no-op silencioso nesse caso.

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().int().positive().default(3000),

  /** String de conexão do Postgres (serviço `vuumbora-banco` no Easypanel). */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),

  /** Lista separada por vírgula. Sem isso o CORS bloqueia o site. */
  ALLOWED_ORIGINS: z
    .string()
    .min(1, 'ALLOWED_ORIGINS é obrigatório (lista separada por vírgula)')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /** Easypanel sempre fica atrás de um proxy — precisamos confiar em X-Forwarded-For para o rate limit por IP funcionar. */
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),

  WAITLIST_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  WAITLIST_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(10),
});

export type Env = Readonly<z.infer<typeof schema>>;

function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`).join('; ');
    // Nunca logar os VALORES das variáveis (podem conter credencial) — só os nomes/mensagens de validação.
    console.error(`[env] configuração inválida — ${issues}`);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
