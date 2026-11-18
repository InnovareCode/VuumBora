/**
 * ButtonCore — base interna de PrimaryButton/SecondaryButton/DangerButton.
 * Não é exportada por `index.ts`. Centraliza os 5 estados exigidos pelo DS:
 * padrão, pressionado, desabilitado (cores sólidas, sem opacidade), carregando
 * (spinner substitui o rótulo, interação bloqueada) e erro (borda `dangerFill`
 * + legenda com ícone, nunca só cor).
 */
import { memo, useCallback } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { theme } from '@vuumbora/tokens';
import { glyphStyle, textStyle } from './typography';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

export interface ButtonCoreProps {
  readonly variant: ButtonVariant;
  readonly label: string;
  readonly onPress?: (event: GestureResponderEvent) => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly error?: boolean;
  readonly errorMessage?: string;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

function variantColors(variant: ButtonVariant, pressed: boolean) {
  switch (variant) {
    case 'primary':
      return {
        background: pressed ? theme.role.ctaBackgroundPressed : theme.role.ctaBackground,
        text: theme.role.ctaText,
        border: 'transparent',
      };
    case 'secondary':
      return {
        background: pressed ? theme.role.surface : theme.role.surfaceElevated,
        text: theme.role.textPrimary,
        border: theme.role.borderControl,
      };
    case 'danger':
      return {
        background: theme.role.dangerFill,
        text: theme.role.textPrimary,
        border: 'transparent',
      };
  }
}

function getVisualState(variant: ButtonVariant, pressed: boolean, disabled: boolean, error: boolean) {
  if (disabled) {
    return {
      background: theme.role.surfaceElevated,
      text: theme.role.textMuted,
      borderColor: variant === 'secondary' ? theme.role.borderControl : 'transparent',
      borderWidth: variant === 'secondary' ? 1.5 : 0,
    };
  }
  const base = variantColors(variant, pressed);
  return {
    background: base.background,
    text: base.text,
    borderColor: error ? theme.role.dangerFill : base.border,
    borderWidth: variant === 'secondary' || error ? 1.5 : 0,
  };
}

export const ButtonCore = memo(function ButtonCore({
  variant,
  label,
  onPress,
  disabled = false,
  loading = false,
  error = false,
  errorMessage,
  accessibilityLabel,
  testID,
}: ButtonCoreProps) {
  const isInteractive = !disabled && !loading;

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (!isInteractive) return;
      onPress?.(event);
    },
    [isInteractive, onPress]
  );

  return (
    <View>
      <Pressable
        onPress={handlePress}
        disabled={!isInteractive}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: !isInteractive, busy: loading }}
        aria-busy={loading}
        testID={testID}
        style={({ pressed }) => {
          const v = getVisualState(variant, pressed, disabled, error);
          return [
            styles.base,
            {
              backgroundColor: v.background,
              borderColor: v.borderColor,
              borderWidth: v.borderWidth,
              opacity: variant === 'danger' && pressed && isInteractive ? 0.85 : 1,
            },
          ];
        }}
      >
        {({ pressed }) => {
          const v = getVisualState(variant, pressed, disabled, error);
          return loading ? (
            <ActivityIndicator color={v.text} />
          ) : (
            <Text style={[styles.label, { color: v.text }]} numberOfLines={1}>
              {label}
            </Text>
          );
        }}
      </Pressable>
      {error && errorMessage ? (
        <View style={styles.errorRow} accessibilityRole="alert">
          <Text style={styles.errorGlyph}>✕</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  base: {
    minHeight: theme.layout.buttonHeight,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing['6'],
  },
  label: textStyle('semibold', 'body'),
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['1'],
    marginTop: theme.spacing['1'],
  },
  // Glifo (✕): fonte do sistema de propósito — ver nota em typography.ts.
  errorGlyph: { color: theme.role.danger, ...glyphStyle(theme.typography.weight.bold, 'small') },
  errorText: { color: theme.role.danger, ...textStyle('regular', 'small') },
});
