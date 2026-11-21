/**
 * Carrega e valida variáveis de ambiente uma única vez, no boot. Falhar
 * rápido aqui evita um servidor no ar com `DATABASE_URL` vazio silencioso.
 */
import 'dotenv/config';
import { z } from 'zod';
import { parseTrustProxy } from './lib/trust-proxy.js';

// `dotenv/config` só lê um `.env` se ele existir no diretório de trabalho
// (uso local); em produção (Easypanel) não há arquivo — as variáveis já
// vêm injetadas direto no ambiente do contêiner, e o import acima é um
// no-op silencioso nesse caso.

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().int().positive().default(3000),

  /** String de conexão do Postgres (serviço `vuumbora-banco` no Easypanel). */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),

  /**
   * Lista separada por vírgula — origens do SITE PÚBLICO (`/v1/waitlist`,
   * `/v1/driver-applications`). Sem isso o CORS bloqueia o site.
   *
   * Achado do Órion (auditoria de 20/11/2026, "Rodada 3"): até aqui esta
   * variável também continha o domínio do painel admin, e um ÚNICO
   * registro de `@fastify/cors` (global, `credentials:true`) valia para
   * TODA rota — inclusive as públicas. Como o site é a superfície mais
   * exposta a XSS de terceiro, um XSS ali conseguia `fetch('/v1/admin/me',
   * {credentials:'include'})`: o cookie de sessão do admin viaja sozinho
   * (same-site, `SameSite=Lax` não bloqueia), o CORS refletia a origem do
   * site COM credenciais (porque ela precisava estar na lista por outro
   * motivo legítimo), e o atacante lia `data.csrfToken` do corpo — CSRF
   * completo contra `/approve`/`/reject` apesar do token sincronizador.
   *
   * Correção: esta variável e `ADMIN_ALLOWED_ORIGINS` (abaixo) agora
   * alimentam DOIS registros SEPARADOS de `@fastify/cors`, em contextos
   * encapsulados diferentes (`app.ts`) — rotas públicas nunca usam cookie
   * e aqui NUNCA recebem `credentials:true`, não importa quem esteja
   * nesta lista.
   */
  ALLOWED_ORIGINS: z
    .string()
    .min(1, 'ALLOWED_ORIGINS é obrigatório (lista separada por vírgula)')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),

  /**
   * Lista separada por vírgula — origens do PAINEL ADMIN
   * (`/v1/admin/*`), a ÚNICA família de rota com `credentials:true`
   * (cookie de sessão httpOnly). NUNCA inclua aqui o domínio do site
   * público, mesmo que pareça conveniente "unificar" — é exatamente essa
   * mistura que o achado do Órion corrigiu. Produção:
   * `https://admin.vuumbora.com.br`. Local: porta dev do `apps/admin`
   * (ver `apps/admin/vite.config.ts`).
   */
  ADMIN_ALLOWED_ORIGINS: z
    .string()
    .min(1, 'ADMIN_ALLOWED_ORIGINS é obrigatório (lista separada por vírgula) — nunca reaproveite ALLOWED_ORIGINS aqui')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  /**
   * Quantos proxies ficam à frente da API (padrão 1: o Traefik do Easypanel),
   * ou lista de IP/CIDR confiáveis, ou `false`. NUNCA "confie em tudo": ver
   * `lib/trust-proxy.ts` (achado A-1 — `X-Forwarded-For` forjado driblava todo
   * limite por IP). Se houver CDN na frente do Traefik, ponha 2.
   */
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((value, ctx) => {
      try {
        return parseTrustProxy(value);
      } catch (err) {
        ctx.addIssue({ code: 'custom', message: err instanceof Error ? err.message : 'TRUST_PROXY inválido' });
        return z.NEVER;
      }
    }),

  /**
   * O boot cria o banco (se faltar) e aplica as migrações pendentes antes
   * de aceitar a primeira requisição. Ligado por padrão: publicar não pode
   * depender de alguém colar SQL no console certo do banco certo.
   * Para desligar (ex.: migração manual controlada), ponha `false`.
   */
  RUN_MIGRATIONS_ON_BOOT: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),

  /**
   * Criar o banco da DATABASE_URL quando ele não existe. Separado do item
   * acima porque em Postgres gerenciado o banco já vem pronto e o usuário
   * não tem permissão de CREATE DATABASE — ali isto só gera ruído no log.
   */
  CREATE_DATABASE_IF_MISSING: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),

  /** Quanto esperar o Postgres aceitar conexão no boot: ele costuma subir depois da API. */
  DB_BOOT_WAIT_SECONDS: z.coerce.number().int().positive().default(60),

  WAITLIST_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  WAITLIST_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(10),

  /** Rota separada (`/v1/driver-applications`) — limite próprio, mesmo padrão da lista de espera. */
  DRIVER_APPLICATION_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  DRIVER_APPLICATION_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(10),

  /**
   * Limite estrito de tentativas de login do admin, por IP (mesmo padrão
   * em memória das outras rotas — ver `@fastify/rate-limit` em `app.ts`).
   * Default agressivo de propósito: é a porta de entrada para dado
   * pessoal de gente real.
   */
  ADMIN_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  ADMIN_LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),

  /** Expiração deslizante da sessão de admin (cookie httpOnly) — renovada a cada requisição autenticada. */
  ADMIN_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),

  /**
   * Teto absoluto da sessão de admin, independente de uso — fixado no
   * login e nunca avançado (ver migração 0007). Sem isto, a expiração
   * deslizante acima sozinha deixa um cookie roubado e usado de vez em
   * quando válido para sempre. Default 7 dias.
   */
  ADMIN_SESSION_ABSOLUTE_TTL_HOURS: z.coerce.number().int().positive().default(24 * 7),

  /**
   * Chave AES-256 (32 bytes em base64: `openssl rand -base64 32`) que cifra
   * os segredos TOTP em repouso. Opcional no boot para não derrubar um
   * deploy antigo, mas SEM ela o 2FA falha fechado: quem exige 2FA (dono,
   * financeiro) recebe 503 no login em vez de entrar sem segundo fator.
   * Perder/trocar a chave invalida todos os segredos já enrolados.
   */
  ADMIN_TOTP_ENCRYPTION_KEY: z
    .string()
    .optional()
    .transform((value) => (value && value.trim() !== '' ? value.trim() : undefined))
    .refine(
      (value) => value === undefined || Buffer.from(value, 'base64').length === 32,
      'ADMIN_TOTP_ENCRYPTION_KEY deve ser 32 bytes em base64',
    ),
  /** Nome que aparece no app autenticador. */
  ADMIN_TOTP_ISSUER: z.string().min(1).default('VuumBora Admin'),
  /** Erros seguidos de código antes de travar o admin (429). */
  ADMIN_TOTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  ADMIN_TOTP_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
  /** Validade do desafio entre a senha e o código (também cobre ler o QR no enrolamento). */
  ADMIN_LOGIN_CHALLENGE_TTL_MINUTES: z.coerce.number().int().positive().default(10),
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
