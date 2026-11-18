import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { withAlpha } from './colorAlpha';
import { glyphStyle, textStyle } from './typography';

export type StatusBadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export interface StatusBadgeProps {
  readonly variant: StatusBadgeVariant;
  readonly label: string;
  readonly testID?: string;
}

/**
 * Direção de arte §9 item 1 / auditoria A2: toda variante é TINGIDA (fundo a 14% sobre
 * `surface`, borda a 40%, texto/glifo na própria cor) — nenhuma preenchida. Antes,
 * `info` preenchido (azul `info` cheio) virava o elemento mais chamativo da tela
 * "a caminho", competindo com o CTA; preenchido também reprova contraste de texto
 * branco sobre `success` (2,28:1, §2.1). `danger` usa `theme.role.danger` (nunca
 * `dangerFill`, reservado a fundo CHEIO de botão/selo — mesma régua do `ButtonCore`).
 * Todo estado continua com um glifo além da cor ("estado nunca só por cor").
 */
const VARIANT_COLOR: Record<Exclude<StatusBadgeVariant, 'neutral'>, string> = {
  success: theme.role.success,
  warning: theme.role.warning,
  info: theme.role.info,
  danger: theme.role.danger,
};

const GLYPH: Record<StatusBadgeVariant, string> = {
  success: '✓',
  warning: '!',
  info: 'i',
  danger: '✕',
  neutral: '•',
};

export const StatusBadge = memo(function StatusBadge({ variant, label, testID }: StatusBadgeProps) {
  const isNeutral = variant === 'neutral';
  const color = isNeutral ? theme.role.textSecondary : VARIANT_COLOR[variant];
  const background = isNeutral ? theme.role.surfaceElevated : withAlpha(color, 0.14);
  const borderColor = isNeutral ? theme.role.borderControl : withAlpha(color, 0.4);

  return (
    <View
      style={[styles.badge, { backgroundColor: background, borderColor }]}
      accessibilityRole="text"
      accessibilityLabel={label}
      testID={testID}
    >
      <Text style={[styles.glyph, { color }]}>{GLYPH[variant]}</Text>
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['1'],
    paddingHorizontal: theme.spacing['3'],
    paddingVertical: theme.spacing['1'],
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  // Glifo (✓ ✕ ! i •): fonte do sistema de propósito — ver nota em typography.ts.
  glyph: glyphStyle(theme.typography.weight.bold, 'small'),
  label: textStyle('semibold', 'small'),
});
