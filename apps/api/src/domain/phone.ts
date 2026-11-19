/**
 * Normalização de celular brasileiro (WhatsApp). Aceita os formatos que uma
 * pessoa realmente digita — com ou sem DDI (+55/55), com ou sem parênteses/
 * espaço/hífen, e com ou sem o 9º dígito (números digitados antes da
 * universalização do nono dígito do celular, em 2016/2017) — e normaliza
 * tudo para E.164 (`+55DDXXXXXXXXX`) antes de gravar.
 *
 * Retorna `null` quando não é um celular brasileiro plausível. Não existe
 * validação 100% garantida sem consultar a operadora — este é um filtro de
 * formato, não uma prova de que o número existe ou atende no WhatsApp.
 */
export function normalizeBrazilianPhone(raw: string): string | null {
  const digitsOnly = raw.replace(/\D/g, '');
  if (!digitsOnly) return null;

  let national = digitsOnly;

  // DDI explícito (+55/55): só remove se o tamanho resultante bater com
  // DDD + assinante de 8 ou 9 dígitos — evita remover "55" quando ele é,
  // na verdade, o DDD do Rio Grande do Sul.
  if (national.startsWith('55') && (national.length === 12 || national.length === 13)) {
    national = national.slice(2);
  }

  // Formato antigo sem o 9º dígito: DDD (2) + assinante (8) = 10 dígitos.
  // Todo celular brasileiro ganhou o 9 inicial do assinante desde 2016/2017.
  if (national.length === 10) {
    national = `${national.slice(0, 2)}9${national.slice(2)}`;
  }

  if (national.length !== 11) return null;

  const ddd = national.slice(0, 2);
  const subscriber = national.slice(2);

  // DDD brasileiro: dois dígitos, nenhum dos dois é zero.
  if (!/^[1-9][1-9]$/.test(ddd)) return null;
  // Celular sempre começa com 9 depois do DDD (o que distingue de fixo).
  if (subscriber[0] !== '9') return null;

  return `+55${national}`;
}

/** As 26 UFs + Distrito Federal. Qualquer UF é aceita — o dono filtra por região depois. */
export const BRAZILIAN_STATE_CODES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;

export type BrazilianStateCode = (typeof BRAZILIAN_STATE_CODES)[number];

/** Normaliza para maiúsculas/sem espaço e confirma que é uma UF válida, ou `null`. */
export function normalizeBrazilianState(raw: string): BrazilianStateCode | null {
  const normalized = raw.trim().toUpperCase();
  return (BRAZILIAN_STATE_CODES as readonly string[]).includes(normalized)
    ? (normalized as BrazilianStateCode)
    : null;
}
