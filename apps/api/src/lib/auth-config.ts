/**
 * Configuração da identidade dos apps (`/v1/auth/*`). Lê `process.env`
 * direto (e não `env.ts`) para não acoplar ao schema do painel admin, e
 * FALHA FECHADO: sem os dois segredos (ou com segredo fraco/repetido), as
 * rotas respondem 503 em vez de assinar token com segredo previsível.
 * Nunca logar nenhum destes valores.
 */
import { z } from 'zod';
import type { DelaySchedule } from './progressive-delay.js';

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const schema = z.object({
  /** Chave do HMAC-SHA256 de identificador/IP/código de e-mail. Troca = zera histórico de bloqueio e invalida códigos vivos. */
  AUTH_PEPPER: z.string().min(32),
  /** Chave de assinatura do token de acesso (HS256). Separada do pepper de propósito. */
  AUTH_JWT_SECRET: z.string().min(32),
  AUTH_ACCESS_TTL_MINUTES: positiveInt(15),
  AUTH_REFRESH_TTL_DAYS: positiveInt(30),
  /** Teto absoluto da sessão (família): a rotação nunca passa disto. */
  AUTH_SESSION_ABSOLUTE_TTL_DAYS: positiveInt(90),
  AUTH_BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  /**
   * Login: ATRASO PROGRESSIVO por par (tipo + identificador + IP) — espera depois da 1ª falha, que dobra a cada
   * falha até o teto (decisão do dono, I-6; `lib/progressive-delay.ts`). Sem bloqueio da conta inteira: quem erra de
   * outro IP não impede o titular de entrar. 429 + Retry-After enquanto a espera não passou.
   */
  AUTH_LOGIN_DELAY_BASE_SECONDS: positiveInt(1),
  AUTH_LOGIN_DELAY_MAX_SECONDS: positiveInt(900),
  /** Cadastro (consulta de "e-mail já cadastrado"): tentativas por e-mail e por IP na janela. */
  AUTH_REGISTER_MAX_PER_IDENTIFIER: positiveInt(5),
  AUTH_REGISTER_MAX_PER_IP: positiveInt(30),
  AUTH_REGISTER_WINDOW_MINUTES: positiveInt(60),
  /** Pedidos de código (reenvio, esqueci a senha): por conta/e-mail e por IP na janela. */
  AUTH_CODE_REQUEST_MAX_PER_IDENTIFIER: positiveInt(5),
  AUTH_CODE_REQUEST_MAX_PER_IP: positiveInt(20),
  AUTH_CODE_REQUEST_WINDOW_MINUTES: positiveInt(60),
  /** Código de e-mail: validade (o banco limita a 1 h), intervalo mínimo e teto por hora do reenvio. */
  AUTH_EMAIL_CODE_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  AUTH_EMAIL_CODE_MIN_INTERVAL_SECONDS: positiveInt(60),
  AUTH_EMAIL_CODE_MAX_PER_HOUR: z.coerce.number().int().min(1).max(20).default(5),
  /**
   * Teto GLOBAL de e-mails de identidade por hora (I-5a), em dois baldes independentes: "verificação"
   * (cadastro + reenvio) e "redefinição de senha". Esgotado um, os pedidos daquela classe respondem 429 a
   * todos (sem revelar nada de conta): protege a cota do provedor SMTP e deixa a outra classe funcionando.
   * Ajuste à cota real do provedor.
   */
  AUTH_EMAIL_GLOBAL_MAX_PER_HOUR: positiveInt(100),
  /**
   * Redefinição de senha: teto CUMULATIVO de falhas de código por conta em 24 h (I-7). Somando todos os
   * códigos do dia: passado o teto, nem o código certo vale até as falhas saírem da janela.
   */
  AUTH_RESET_MAX_FAILURES_PER_DAY: z.coerce.number().int().min(1).max(100).default(10),
  /**
   * Conferência de código (verificar e-mail, redefinir senha): tentativas por PAR (tipo + identificador + IP) na janela,
   * contadas ANTES do bcrypt (A-1, rodada 3). Acima do que um dono de conta digita (5 por código), abaixo do que
   * ocupa a CPU: o par é o mesmo "par" do login. Quem troca o identificador a cada tentativa não é freado por
   * aqui, e sim pelo teto global de concorrência do bcrypt (`lib/bcrypt-pool.ts`).
   */
  AUTH_CODE_CHECK_MAX_PER_PAIR: positiveInt(10),
  AUTH_CODE_CHECK_WINDOW_MINUTES: positiveInt(15),
  /** Limite por IP (em memória, além dos limites no banco). */
  AUTH_IP_RATE_LIMIT_MAX: positiveInt(30),
  AUTH_IP_RATE_LIMIT_WINDOW_MINUTES: positiveInt(15),
});

export interface AuthConfig {
  readonly pepper: string;
  readonly jwtSecret: string;
  readonly accessTtlSeconds: number;
  readonly refreshTtlMs: number;
  readonly sessionAbsoluteTtlMs: number;
  readonly bcryptCost: number;
  readonly loginDelay: DelaySchedule;
  readonly registerMaxPerIdentifier: number;
  readonly registerMaxPerIp: number;
  readonly registerWindowMinutes: number;
  readonly codeRequestMaxPerIdentifier: number;
  readonly codeRequestMaxPerIp: number;
  readonly codeRequestWindowMinutes: number;
  readonly emailCodeTtlSeconds: number;
  readonly emailCodeMinIntervalSeconds: number;
  readonly emailCodeMaxPerHour: number;
  readonly emailGlobalMaxPerHour: number;
  readonly resetMaxFailuresPerDay: number;
  readonly codeCheckMaxPerPair: number;
  readonly codeCheckWindowMinutes: number;
  readonly ipRateLimitMax: number;
  readonly ipRateLimitWindowMs: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DISTINCT_CHARS = 12;
const MIN_ENTROPY_BITS_PER_CHAR = 3.0;

/** Entropia de Shannon (bits por caractere) da distribuição de caracteres do segredo. */
export function shannonBitsPerChar(value: string): number {
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  let bits = 0;
  for (const n of counts.values()) bits -= (n / total) * Math.log2(n / total);
  return bits;
}

/**
 * Segredo "de gerador" e não "de teclado": `min(32)` aceitaria 32 letras
 * iguais. `openssl rand -base64 48` passa com folga (~5,5 bits/char, 30+ distintos).
 */
export function isStrongSecret(value: string): boolean {
  return new Set(value).size >= MIN_DISTINCT_CHARS && shannonBitsPerChar(value) >= MIN_ENTROPY_BITS_PER_CHAR;
}

/**
 * Por que a identidade dos apps ficaria indisponível (503), SÓ com nomes de variável e motivo — nunca o valor, nem um
 * pedaço dele. Lista vazia = a configuração é válida. É o que o boot e o log mostram: sem isto, "faltou segredo" e
 * "segredo fraco" e "dois iguais" eram a mesma linha muda no log.
 */
export function authConfigProblems(source: NodeJS.ProcessEnv = process.env): string[] {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    return [...new Set(parsed.error.issues.map((issue) => `${String(issue.path[0] ?? 'AUTH_*')}:${issue.code === 'invalid_type' ? 'missing_or_invalid' : issue.code}`))];
  }
  const v = parsed.data;
  const problems: string[] = [];
  if (v.AUTH_PEPPER === v.AUTH_JWT_SECRET) problems.push('AUTH_PEPPER:equals_AUTH_JWT_SECRET');
  if (!isStrongSecret(v.AUTH_PEPPER)) problems.push('AUTH_PEPPER:weak');
  if (!isStrongSecret(v.AUTH_JWT_SECRET)) problems.push('AUTH_JWT_SECRET:weak');
  return problems;
}

/** `null` quando faltam segredos válidos (rotas respondem 503). */
export function loadAuthConfig(source: NodeJS.ProcessEnv = process.env): AuthConfig | null {
  const parsed = schema.safeParse(source);
  if (!parsed.success) return null;
  const v = parsed.data;
  // Dois segredos IGUAIS anulam a separação de funções (quem forja HMAC de IP forjaria JWT).
  if (v.AUTH_PEPPER === v.AUTH_JWT_SECRET) return null;
  if (!isStrongSecret(v.AUTH_PEPPER) || !isStrongSecret(v.AUTH_JWT_SECRET)) return null;
  return {
    pepper: v.AUTH_PEPPER,
    jwtSecret: v.AUTH_JWT_SECRET,
    accessTtlSeconds: v.AUTH_ACCESS_TTL_MINUTES * 60,
    refreshTtlMs: v.AUTH_REFRESH_TTL_DAYS * DAY_MS,
    sessionAbsoluteTtlMs: v.AUTH_SESSION_ABSOLUTE_TTL_DAYS * DAY_MS,
    bcryptCost: v.AUTH_BCRYPT_COST,
    // O teto nunca fica abaixo da base (config absurda não pode inverter a espera).
    loginDelay: { baseSeconds: v.AUTH_LOGIN_DELAY_BASE_SECONDS, maxSeconds: Math.max(v.AUTH_LOGIN_DELAY_MAX_SECONDS, v.AUTH_LOGIN_DELAY_BASE_SECONDS) },
    registerMaxPerIdentifier: v.AUTH_REGISTER_MAX_PER_IDENTIFIER,
    registerMaxPerIp: v.AUTH_REGISTER_MAX_PER_IP,
    registerWindowMinutes: v.AUTH_REGISTER_WINDOW_MINUTES,
    codeRequestMaxPerIdentifier: v.AUTH_CODE_REQUEST_MAX_PER_IDENTIFIER,
    codeRequestMaxPerIp: v.AUTH_CODE_REQUEST_MAX_PER_IP,
    codeRequestWindowMinutes: v.AUTH_CODE_REQUEST_WINDOW_MINUTES,
    emailCodeTtlSeconds: v.AUTH_EMAIL_CODE_TTL_MINUTES * 60,
    emailCodeMinIntervalSeconds: v.AUTH_EMAIL_CODE_MIN_INTERVAL_SECONDS,
    emailCodeMaxPerHour: v.AUTH_EMAIL_CODE_MAX_PER_HOUR,
    emailGlobalMaxPerHour: v.AUTH_EMAIL_GLOBAL_MAX_PER_HOUR,
    resetMaxFailuresPerDay: v.AUTH_RESET_MAX_FAILURES_PER_DAY,
    codeCheckMaxPerPair: v.AUTH_CODE_CHECK_MAX_PER_PAIR,
    codeCheckWindowMinutes: v.AUTH_CODE_CHECK_WINDOW_MINUTES,
    ipRateLimitMax: v.AUTH_IP_RATE_LIMIT_MAX,
    ipRateLimitWindowMs: v.AUTH_IP_RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  };
}
