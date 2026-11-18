import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { LoadingSkeleton } from './LoadingSkeleton';
import { SurfaceRaised } from './SurfaceRaised';
import { glyphStyle, tabularNums, textStyle } from './typography';

export type MetricTrend = 'up' | 'down' | 'neutral';

export interface MetricCardProps {
  readonly label: string;
  readonly value: string;
  readonly helperText?: string;
  readonly trend?: MetricTrend;
  /** Ícone já resolvido pelo app (lib de ícone é decisão do app, não da `ui` — mesmo padrão de `ButtonCore.icon`). */
  readonly icon?: ReactNode;
  /** Padding/fonte reduzidos para grades apertadas (ex.: 4 cards numa linha a 360pt). */
  readonly compact?: boolean;
  readonly loading?: boolean;
  readonly testID?: string;
}

/** Tendência sempre com glifo + palavra (nunca só a cor) — ex.: ganhos, avaliação média. */
const TREND_STYLE: Record<MetricTrend, { glyph: string; color: string; word: string }> = {
  up: { glyph: '▲', color: theme.role.success, word: 'alta' },
  down: { glyph: '▼', color: theme.role.danger, word: 'queda' },
  neutral: { glyph: '●', color: theme.role.textMuted, word: 'estável' },
};

export const MetricCard = memo(function MetricCard({
  label,
  value,
  helperText,
  trend,
  icon,
  compact = false,
  loading = false,
  testID,
}: MetricCardProps) {
  return (
    <SurfaceRaised
      style={[styles.card, compact && styles.cardCompact]}
      testID={testID}
      accessibilityLabel={`${label}: ${loading ? 'carregando' : value}`}
    >
      {icon ? <View style={styles.iconSlot}>{icon}</View> : null}
      {/* numberOfLines=2 (sem risco de truncar rótulo normal) evita que "Taxa de
          aceitação" force o card a crescer na grade de 4 colunas (~66pt a 360px).
          Compact usa fonte 'caption' (12px, não 'small' 14px): medido que "Taxa de
          aceitação" em 14px quebrava em 3 linhas a 360px e cortava a 3ª com "…". */}
      <Text style={[styles.label, compact && styles.labelCompact]} numberOfLines={compact ? 2 : 3}>
        {label}
      </Text>
      {loading ? (
        <LoadingSkeleton variant="line" width={compact ? 56 : 96} height={compact ? 18 : 24} />
      ) : (
        <>
          {/* tabular-nums obrigatório: preço/métrica não pode "dançar" de largura (docs/tipografia.md).
              numberOfLines=1 é uma rede de segurança: medido (Playwright, fonte real carregada) que
              "R$ 247,90"/"R$ 1.234,56" em 'subtitle' (18px) cabem com folga nos 124px de conteúdo do
              card mais apertado do app (grade 2x2 do motorista a 360px) — a tendência mora numa linha
              PRÓPRIA abaixo (não mais ao lado do valor) porque nem o valor nem a tendência cabiam
              dividindo a mesma linha nesse card estreito. */}
          <Text style={[styles.value, compact && styles.valueCompact]} numberOfLines={1}>
            {value}
          </Text>
          {trend ? (
            // Dois Text irmãos (não aninhados): fontFamily não herda e o glifo (▲▼●)
            // fica na fonte do sistema, a palavra na da marca — ver typography.ts.
            <View style={styles.trendRow}>
              <Text style={[styles.trendGlyph, { color: TREND_STYLE[trend].color }]}>{TREND_STYLE[trend].glyph}</Text>
              <Text style={[styles.trend, { color: TREND_STYLE[trend].color }]}>{TREND_STYLE[trend].word}</Text>
            </View>
          ) : null}
        </>
      )}
      {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </SurfaceRaised>
  );
});

const styles = StyleSheet.create({
  // Auditoria M3: o card não tinha borda nenhuma (fundo chapado `theme.role.surface`
  // sem traço). Agora usa `SurfaceRaised` (gradiente sutil, como os outros cards do DS)
  // + a mesma borda iluminada de cima (`edgeTop`/`edgeBottom`, item 2).
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['1'],
  },
  // Padding mínimo (spacing[1]=4, não spacing[2]=8): medido (Playwright) que
  // "R$ 247,90" em 'body' (16px) estourava os ~58-76px de conteúdo da grade de 4
  // colunas em 360-430px mesmo com padding[2] — 'caption' (12px) + padding[1]
  // sobra margem confirmada em todos os 4 breakpoints pedidos.
  cardCompact: { padding: theme.spacing['1'], borderRadius: theme.radius.md },
  iconSlot: { width: 20, height: 20, alignItems: 'flex-start', justifyContent: 'center' },
  label: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  labelCompact: { ...textStyle('regular', 'caption') },
  value: { color: theme.role.textPrimary, ...textStyle('bold', 'subtitle'), ...tabularNums },
  valueCompact: { ...textStyle('bold', 'caption'), ...tabularNums },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  trend: { ...textStyle('semibold', 'caption') },
  // Glifo (▲▼●): fonte do sistema de propósito — ver nota em typography.ts.
  trendGlyph: glyphStyle(theme.typography.weight.semibold, 'caption'),
  helper: { color: theme.role.textMuted, ...textStyle('regular', 'caption') },
});
