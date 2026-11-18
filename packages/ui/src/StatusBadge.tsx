import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';

export type StatusBadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

export interface StatusBadgeProps {
  readonly variant: StatusBadgeVariant;
  readonly label: string;
  readonly testID?: string;
}

/**
 * Regra do DS: `danger` usa `dangerFill` (nunca `danger`) com texto branco; os demais
 * preenchimentos são claros, então o texto é sempre `ctaText`. Todo estado tem um
 * glifo além da cor (rule "estado nunca só por cor").
 */
const VARIANT_STYLE: Record<StatusBadgeVariant, { background: string; text: string; glyph: string }> = {
  success: { background: theme.role.success, text: theme.role.ctaText, glyph: '✓' },
  warning: { background: theme.role.warning, text: theme.role.ctaText, glyph: '!' },
  info: { background: theme.role.info, text: theme.role.ctaText, glyph: 'i' },
  danger: { background: theme.role.dangerFill, text: theme.role.textPrimary, glyph: '✕' },
  neutral: { background: theme.role.surfaceElevated, text: theme.role.textSecondary, glyph: '•' },
};

export const StatusBadge = memo(function StatusBadge({ variant, label, testID }: StatusBadgeProps) {
  const style = VARIANT_STYLE[variant];
  return (
    <View
      style={[styles.badge, { backgroundColor: style.background }]}
      accessibilityRole="text"
      accessibilityLabel={label}
      testID={testID}
    >
      <Text style={[styles.glyph, { color: style.text }]}>{style.glyph}</Text>
      <Text style={[styles.label, { color: style.text }]} numberOfLines={1}>
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
    alignSelf: 'flex-start',
  },
  glyph: { fontSize: theme.typography.size.small, fontWeight: theme.typography.weight.bold },
  label: { fontSize: theme.typography.size.small, fontWeight: theme.typography.weight.semibold },
});
