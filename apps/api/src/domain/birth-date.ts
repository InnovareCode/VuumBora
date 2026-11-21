/**
 * Idade mínima do cadastro (decisão do dono, 21/11/2026): 18 anos completos, para passageiro e motorista.
 * Regra pura (sem I/O). O servidor valida aqui; o BANCO é a rede de segurança (gatilho da migração 0019,
 * que faz a MESMA conta com `now() AT TIME ZONE 'America/Fortaleza'`).
 *
 * A data de nascimento é dado pessoal: trafega como TEXTO `AAAA-MM-DD` (nunca vira `Date` do JS — o `pg`
 * desloca `DATE` pelo fuso do processo), entra no banco com `$n::date` e NUNCA é lida de volta, logada nem
 * devolvida em resposta.
 */

export const MINIMUM_AGE_YEARS = 18;
/** Fuso do negócio (Natal). O servidor costuma estar em UTC: às 21h em Natal já é "amanhã" lá. */
export const BUSINESS_TIME_ZONE = 'America/Fortaleza';
/** Espelha o CHECK `accounts_birth_date_plausible` da 0019. */
const EARLIEST_PLAUSIBLE = '1900-01-01';

export type BirthDateCheck = { readonly ok: true } | { readonly ok: false; readonly reason: 'invalid' | 'underage' };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** O dia de hoje em Natal, `AAAA-MM-DD`. */
export function todayInBusinessZone(now: Date = new Date()): string {
  // `en-CA` formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * A data de nascimento MAIS RECENTE que já tem 18 anos completos hoje (= hoje menos 18 anos).
 * Quem nasceu em 29/02 completa 18 em 01/03 nos anos não bissextos: o dia 29/02 de um ano não bissexto
 * recua para 28/02 (é o que o Postgres faz em `date - interval '18 years'`), então 29/02/2004 só passa a ser
 * "adulto" quando o corte chega a 29/02 ou 01/03/2004 — ou seja, em 01/03/2022.
 */
export function latestAdultBirthDate(today: string): string {
  const [, year, month, day] = ISO_DATE.exec(today)!.map(Number) as [number, number, number, number];
  const targetYear = year - MINIMUM_AGE_YEARS;
  const targetDay = Math.min(day, daysInMonth(targetYear, month));
  return `${pad(targetYear, 4)}-${pad(month, 2)}-${pad(targetDay, 2)}`;
}

/** `AAAA-MM-DD` real (calendário), não anterior a 1900, não futura e com 18 anos completos. */
export function checkBirthDate(value: string, now: Date = new Date()): BirthDateCheck {
  const match = ISO_DATE.exec(value);
  if (!match) return { ok: false, reason: 'invalid' };
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return { ok: false, reason: 'invalid' };
  if (value < EARLIEST_PLAUSIBLE) return { ok: false, reason: 'invalid' };

  const today = todayInBusinessZone(now);
  if (value > today) return { ok: false, reason: 'invalid' };
  if (value > latestAdultBirthDate(today)) return { ok: false, reason: 'underage' };
  return { ok: true };
}
