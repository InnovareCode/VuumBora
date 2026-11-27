/**
 * CPF (fatia K0 do `docs/plano-m3-m4.md`, `PUT /v1/driver/onboarding` → `422 invalid_cpf`). Mora na
 * raiz do domínio: hoje só o motorista informa CPF (M02, etapa 2), mas o passageiro vai precisar
 * dele no pagamento (Pix), e a regra é uma só.
 *
 * Confere os dois dígitos verificadores (módulo 11). Não confere se o CPF EXISTE na Receita: isso
 * não é regra pura, é consulta externa.
 */

/** Só os algarismos: aceita `123.456.789-09`, `12345678909` e espaços. */
export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, '');
}

function checkDigit(digits: readonly number[], length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += (digits[i] ?? 0) * (length + 1 - i);
  }
  const rest = (sum * 10) % 11;
  return rest === 10 ? 0 : rest;
}

/**
 * `true` para CPF com 11 algarismos e dígitos verificadores certos. Recebe `unknown` porque é a
 * validação de um corpo de requisição. Recusa máscara fora do padrão (letras) e a sequência de um
 * algarismo só (`111.111.111-11`), que passa na conta mas não é CPF emitido.
 */
export function isValidCpf(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^[0-9.\-\s]+$/.test(value)) return false;
  const normalized = normalizeCpf(value);
  if (normalized.length !== 11 || /^(\d)\1{10}$/.test(normalized)) return false;
  const digits = [...normalized].map(Number);
  return checkDigit(digits, 9) === digits[9] && checkDigit(digits, 10) === digits[10];
}
