/**
 * InputCore — base interna de todo campo de texto do design system.
 * Não é exportada por `index.ts`: TextInput/PasswordInput/PhoneInput/SearchInput
 * são variações públicas desta mesma implementação (DRY, contrato único de estados).
 *
 * Estados cobertos: padrão, foco, desabilitado, carregando (bloqueia edição +
 * spinner) e erro (borda `dangerFill` + mensagem com ícone, `accessibilityRole="alert"`).
 * Borda de controle é sempre `theme.role.borderControl` (regra do DS: 3:1 garantido
 * nos quatro fundos; `border`/`borderEmphasis` são só decorativos).
 */
import { memo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
  type KeyboardTypeOptions,
  type TextInputProps as RNTextInputProps,
} from 'react-native';
import { theme } from '@vuumbora/tokens';
import { glyphStyle, textStyle } from './typography';

export interface InputCoreProps {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly error?: boolean;
  readonly errorMessage?: string;
  readonly helperText?: string;
  readonly secureTextEntry?: boolean;
  readonly keyboardType?: KeyboardTypeOptions;
  readonly autoCapitalize?: RNTextInputProps['autoCapitalize'];
  readonly autoComplete?: RNTextInputProps['autoComplete'];
  readonly maxLength?: number;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
  readonly leftAccessory?: ReactNode;
  readonly rightAccessory?: ReactNode;
  /** Avisa o pai quando o campo ganha/perde foco (ex.: destacar qual campo está ativo numa busca com vários campos). */
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
}

export const InputCore = memo(function InputCore({
  label,
  value,
  onChangeText,
  placeholder,
  disabled = false,
  loading = false,
  error = false,
  errorMessage,
  helperText,
  secureTextEntry,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  maxLength,
  accessibilityLabel,
  testID,
  leftAccessory,
  rightAccessory,
  onFocus,
  onBlur,
}: InputCoreProps) {
  const [focused, setFocused] = useState(false);
  const editable = !disabled && !loading;

  // Estado de destaque (foco/erro): borda uniforme nos 4 lados, é um indicador de
  // estado, não a luz ambiente do card. Estado padrão: borda iluminada de cima
  // (direção de arte §4/§9 item 2) — mesma técnica de InfoCard/RideCategoryCard.
  const highlighted = error || focused;
  const borderColor = error ? theme.role.dangerFill : focused ? theme.role.ctaBackground : theme.role.edgeBottom;
  const borderTopColor = highlighted ? borderColor : theme.role.edgeTop;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.field,
          {
            backgroundColor: disabled ? theme.role.surfaceElevated : theme.role.input,
            borderColor,
            borderTopColor,
            borderWidth: highlighted ? 2 : 1,
          },
        ]}
      >
        {leftAccessory ? <View style={styles.leftAccessory}>{leftAccessory}</View> : null}
        <RNTextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.role.textMuted}
          editable={editable}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          maxLength={maxLength}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          style={[styles.input, { color: disabled ? theme.role.textMuted : theme.role.textPrimary }]}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={{ disabled: !editable }}
          aria-busy={loading}
          testID={testID}
        />
        {loading ? (
          <ActivityIndicator color={theme.role.textMuted} style={styles.rightAccessory} />
        ) : rightAccessory ? (
          <View style={styles.rightAccessory}>{rightAccessory}</View>
        ) : null}
      </View>
      {error && errorMessage ? (
        <View style={styles.helperRow} accessibilityRole="alert">
          <Text style={styles.errorGlyph}>✕</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : helperText ? (
        <Text style={styles.helperText}>{helperText}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { width: '100%' },
  label: {
    color: theme.role.textSecondary,
    ...textStyle('semibold', 'small'),
    marginBottom: theme.spacing['1'],
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.layout.inputHeight,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing['3'],
  },
  input: {
    flex: 1,
    ...textStyle('regular', 'body'),
    paddingVertical: theme.spacing['2'],
  },
  leftAccessory: { marginRight: theme.spacing['2'] },
  rightAccessory: { marginLeft: theme.spacing['2'] },
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['1'],
    marginTop: theme.spacing['1'],
  },
  // Glifo (✕): fonte do sistema de propósito — ver nota em typography.ts.
  errorGlyph: { color: theme.role.danger, ...glyphStyle(theme.typography.weight.bold, 'small') },
  errorText: { color: theme.role.danger, ...textStyle('regular', 'small'), flexShrink: 1 },
  helperText: { color: theme.role.textMuted, ...textStyle('regular', 'small'), marginTop: theme.spacing['1'] },
});
