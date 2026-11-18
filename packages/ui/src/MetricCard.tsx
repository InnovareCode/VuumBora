import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { LoadingSkeleton } from './LoadingSkeleton';
import { glyphStyle, tabularNums, textStyle } from './typography';

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
          {/* tabular-nums obrigatório: preço/métrica não pode "dançar" de largura (docs/tipografia.md) */}
          <Text style={styles.value}>{value}</Text>
          {trend ? (
            // Dois Text irmãos (não aninhados): fontFamily não herda e o glifo (▲▼●)
            // fica na fonte do sistema, a palavra na da marca — ver typography.ts.
            <View style={styles.trendRow}>
              <Text style={[styles.trendGlyph, { color: TREND_STYLE[trend].color }]}>{TREND_STYLE[trend].glyph}</Text>
              <Text style={[styles.trend, { color: TREND_STYLE[trend].color }]}>{TREND_STYLE[trend].word}</Text>
            </View>
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
  label: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing['2'] },
  value: { color: theme.role.textPrimary, ...textStyle('bold', 'heading'), ...tabularNums },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  trend: { ...textStyle('semibold', 'caption') },
  // Glifo (▲▼●): fonte do sistema de propósito — ver nota em typography.ts.
  trendGlyph: glyphStyle(theme.typography.weight.semibold, 'caption'),
  helper: { color: theme.role.textMuted, ...textStyle('regular', 'caption') },
});
