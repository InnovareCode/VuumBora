import { memo, useCallback } from 'react';
import { InputCore, type InputCoreProps } from './InputCore';

export type PhoneInputProps = Omit<
  InputCoreProps,
  'keyboardType' | 'autoCapitalize' | 'secureTextEntry' | 'maxLength'
>;

/** Máscara (xx) xxxxx-xxxx aplicada na digitação — formatação de exibição, sem regra de negócio. */
function formatBrazilianPhone(digits: string): string {
  const d = digits.slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const PhoneInput = memo(function PhoneInput({ onChangeText, value, ...rest }: PhoneInputProps) {
  const handleChange = useCallback(
    (text: string) => onChangeText(formatBrazilianPhone(text.replace(/\D/g, ''))),
    [onChangeText]
  );

  return (
    <InputCore
      {...rest}
      value={value}
      onChangeText={handleChange}
      keyboardType="phone-pad"
      autoCapitalize="none"
      maxLength={16}
      placeholder={rest.placeholder ?? '(00) 00000-0000'}
    />
  );
});
