import { memo, useCallback } from 'react';
import { InputCore, type InputCoreProps } from './InputCore';

export type DateInputProps = Omit<
  InputCoreProps,
  'keyboardType' | 'autoCapitalize' | 'secureTextEntry' | 'maxLength' | 'autoComplete' | 'textContentType' | 'autoCorrect'
>;

/** Só dígitos, no máximo 8, com as barras de DD/MM/AAAA — formatação de exibição, sem regra de negócio. */
export function maskBrazilianDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * `"15/05/1990"` -> `"1990-05-15"` (a forma do contrato), ou `null` se faltam dígitos, o dia não existe no
 * calendário (31/02) ou o ano é anterior a 1900. Valida só o FORMATO e a existência da data: "tem 18 anos" e
 * "não é futura" são decisão do servidor (`underage`, `invalid_birth_date`), que usa o fuso de Natal e o relógio dele.
 */
export function brazilianDateToIso(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1900 || month < 1 || month > 12 || day < 1) return null;
  const real = new Date(Date.UTC(year, month - 1, day));
  if (real.getUTCFullYear() !== year || real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Data de nascimento em DD/MM/AAAA, digitada (sem seletor nativo: funciona igual no Android, no iOS e no web, e
 * um seletor de roda para "1990" exige girar décadas). Colar "15051990" ou "15/05/1990" dá o mesmo resultado.
 * Sem `autoComplete`: o preenchimento automático entregaria "1990-05-15" e a máscara o embaralharia.
 */
export const DateInput = memo(function DateInput({ onChangeText, placeholder, ...rest }: DateInputProps) {
  const handleChange = useCallback((text: string) => onChangeText(maskBrazilianDate(text)), [onChangeText]);

  return (
    <InputCore
      {...rest}
      onChangeText={handleChange}
      keyboardType="number-pad"
      autoCapitalize="none"
      autoCorrect={false}
      placeholder={placeholder ?? 'DD/MM/AAAA'}
    />
  );
});
