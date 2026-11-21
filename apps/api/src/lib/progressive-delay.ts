/**
 * Atraso PROGRESSIVO entre tentativas de senha (decisão do dono, 21/11/2026 — revisão S1 rodada 2, I-6).
 *
 * Por que não bloquear a conta: um teto por CONTA (qualquer IP) deixa quem só sabe o e-mail da vítima
 * trancá-la de fora, de propósito, por ~1,3 requisição por minuto. Aqui a espera cresce por PAR
 * (identificador + IP): quem erra paga a espera no PRÓPRIO par; o titular, vindo de outro IP, tem um par
 * limpo e entra normalmente.
 *
 * Tabela (base 1 s, teto 900 s): depois da falha número n a próxima tentativa só é aceita passados
 *   n=1: 1 s · 2: 2 s · 3: 4 s · 4: 8 s · 5: 16 s · 6: 32 s · 7: 64 s · 8: 128 s · 9: 256 s · 10: 512 s · 11 em diante: 900 s (15 min).
 *
 * Custo de adivinhação de UM par (atacante esperando o mínimo, tentativa 1 às 0 s):
 *   - tentativas nos primeiros 17 min (1023 s): 11 (instantes 0, 1, 3, 7, 15, 31, 63, 127, 255, 511, 1023 s);
 *   - na primeira hora: 13; depois disso, 4 por hora;
 *   - em 24 h: 105 (o par "esquece" as falhas depois de 24 h SEM errar — ver `LOGIN_FAILURE_MEMORY_HOURS`).
 * Custo TOTAL: soma dos pares. Cada IP novo (cada /64 no IPv6) abre um par novo com 13 tentativas na primeira
 * hora e 105 em 24 h; N IPs = N x isso. O freio por IP (`@fastify/rate-limit`) e a força da senha fazem o resto.
 * É o preço de nunca trancar o titular por causa de terceiros (decisão do dono).
 */

export interface DelaySchedule {
  /** Espera depois da 1ª falha; dobra a cada falha seguinte. */
  readonly baseSeconds: number;
  /** Teto da espera. */
  readonly maxSeconds: number;
}

export const DEFAULT_DELAY_SCHEDULE: DelaySchedule = { baseSeconds: 1, maxSeconds: 900 };

/** Quanto tempo as falhas de um par ficam na memória (sem errar durante este prazo, o par volta ao zero). */
export const LOGIN_FAILURE_MEMORY_HOURS = 24;

/** Espera (em segundos) que a próxima tentativa tem de respeitar depois de `failures` falhas seguidas. 0 = livre. */
export function delayAfterFailures(failures: number, schedule: DelaySchedule = DEFAULT_DELAY_SCHEDULE): number {
  if (failures <= 0) return 0;
  // Expoente limitado: 2^30 já passa de qualquer teto razoável e evita estouro com contagem enorme.
  const raw = schedule.baseSeconds * 2 ** Math.min(failures - 1, 30);
  return Math.min(raw, schedule.maxSeconds);
}

/** A falha número `failures` foi a PRIMEIRA a atingir o teto da espera? (Gatilho de auditoria "travou", uma vez só.) */
export function justReachedMaxDelay(failures: number, schedule: DelaySchedule = DEFAULT_DELAY_SCHEDULE): boolean {
  return delayAfterFailures(failures, schedule) >= schedule.maxSeconds && delayAfterFailures(failures - 1, schedule) < schedule.maxSeconds;
}

/** Tentativas que UM par consegue fazer em `seconds`, esperando sempre o mínimo (a conta dos comentários acima, para teste e documentação). */
export function guessesWithin(seconds: number, schedule: DelaySchedule = DEFAULT_DELAY_SCHEDULE): number {
  let elapsed = 0;
  let attempts = 1; // a 1ª tentativa é livre, em t = 0
  for (let failures = 1; ; failures += 1) {
    elapsed += delayAfterFailures(failures, schedule);
    if (elapsed > seconds) return attempts;
    attempts += 1;
  }
}
