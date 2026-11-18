import { memo } from 'react';
import { InputCore, type InputCoreProps } from './InputCore';

/** Campo de texto genérico — variação pública direta de `InputCore`. */
export type TextInputProps = InputCoreProps;

export const TextInput = memo(function TextInput(props: TextInputProps) {
  return <InputCore {...props} />;
});
