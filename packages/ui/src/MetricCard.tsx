import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { LoadingSkeleton } from './LoadingSkeleton';

export type MetricTrend = 'up' | 'down' | 'neutral';

export interface MetricCardProps {
  readonly label: string;
  readonly value: string;
  readonly helperText?: string;
  readonly trend?: MetricTrend;
  readonly loading?: boolean;
  readonly testID?: string;
}

/** Tendência sempre com glifo + palavra (nunca só a cor) — ex.: ganhos, avaliação média. */
const TREND_STYLE: Record<MetricTrend, { glyph: string; color: string; word: string }> = {
  up: { glyph: '▲', color: theme.role.success, word: 'alta' },
  down: { glyph: '▼', color: theme.role.danger, word: 'queda' },
  neutral: { glyph: '●', color: theme.role.textMuted, word: 'estável' },
};

export const MetricCard = memo(function MetricCard({ label, value, helperText, trend, loading = false, testID }: MetricCardProps) {
  return (
    <View style={styles.card} testID={testID} accessibilityLabel={`${label}: ${loading ? 'carregando' : value}`}>
      <Text style={styles.label}>{label}</Text>
      {loading ? (
        <LoadingSkeleton variant="line" width={96} height={28} />
      ) : (
        <View style={styles.valueRow}>
          <Text style={styles.value}>{value}</Text>
          {trend ? (
            <Text style={[styles.trend, { color: TREND_STYLE[trend].color }]}>
              {TREND_STYLE[trend].glyph} {TREND_STYLE[trend].word}
            </Text>
          ) : null}
        </View>
      )}
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.role.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing['4'],
    gap: theme.spacing['1'],
  },
  label: { color: theme.role.textSecondary, fontSize: theme.typography.size.small },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing['2'] },
  value: { color: theme.role.textPrimary, fontSize: theme.typography.size.heading, fontWeight: theme.typography.weight.bold },
  trend: { fontSize: theme.typography.size.caption, fontWeight: theme.typography.weight.semibold },
  helper: { color: theme.role.textMuted, fontSize: theme.typography.size.caption },
});
