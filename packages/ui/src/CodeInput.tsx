import { memo, useCallback } from 'react';
import { InputCore, type InputCoreProps } from './InputCore';

export type CodeInputProps = Omit<
  InputCoreProps,
  'keyboardType' | 'autoCapitalize' | 'secureTextEntry' | 'maxLength' | 'autoComplete' | 'textContentType' | 'autoCorrect'
> & {
  /** Quantidade de dígitos (código do e-mail: 6). */
  readonly length?: number;
};

/**
 * Campo do código numérico recebido por e-mail/SMS. Teclado numérico e preenchimento automático do código
 * (`one-time-code`). O tamanho é aparado na `onChangeText`, NÃO em `maxLength` nativo: ao COLAR "123 456" (com
 * espaço, como vem em muitos e-mails), `maxLength` cortaria para "123 45" antes do filtro e perderia um dígito.
 */
export const CodeInput = memo(function CodeInput({ onChangeText, length = 6, placeholder, ...rest }: CodeInputProps) {
  const handleChange = useCallback(
    (text: string) => onChangeText(text.replace(/\D/g, '').slice(0, length)),
    [onChangeText, length],
  );

  return (
    <InputCore
      {...rest}
      onChangeText={handleChange}
      keyboardType="number-pad"
      autoCapitalize="none"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      autoCorrect={false}
      placeholder={placeholder ?? '0'.repeat(length)}
    />
  );
});
