import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MetricCard, MockBadge, theme, textStyle } from '@vuumbora/ui';

export interface DailySummarySectionProps {
  readonly earningsLabel: string;
  readonly ridesLabel: string;
  readonly ratingLabel: string;
  readonly acceptanceLabel: string;
}

/**
 * Quatro métricas do dia (ganhos, corridas, avaliação, taxa de aceitação). Todas são
 * DEMONSTRAÇÃO (MOTORISTA.md: "exibir ganhos como valores reais retornados pela API;
 * não codificar... cifras dos mockups" — não existe API ainda, então um `MockBadge`
 * cobre o grupo inteiro, igual ao padrão já usado em "Escolha sua viagem" do
 * passageiro). Reaproveita `MetricCard` de `@vuumbora/ui` — 2x2 em vez de 1x4 para
 * não apertar o valor/rótulo mais longo ("Taxa de aceitação") em telas de 360px.
 */
export const DailySummarySection = memo(function DailySummarySection({
  earningsLabel,
  ridesLabel,
  ratingLabel,
  acceptanceLabel,
}: DailySummarySectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Resumo de hoje</Text>
        <MockBadge label="valores de exemplo" />
      </View>
      <View style={styles.row}>
        <View style={styles.cell}>
          <MetricCard label="Ganhos hoje" value={earningsLabel} trend="up" testID="metric-earnings" />
        </View>
        <View style={styles.cell}>
          <MetricCard label="Corridas hoje" value={ridesLabel} testID="metric-rides" />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.cell}>
          <MetricCard label="Avaliação" value={ratingLabel} testID="metric-rating" />
        </View>
        <View style={styles.cell}>
          <MetricCard label="Taxa de aceitação" value={acceptanceLabel} trend="up" testID="metric-acceptance" />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { gap: theme.spacing['3'] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing['2'] },
  title: { color: theme.role.textPrimary, ...textStyle('bold', 'body') },
  row: { flexDirection: 'row', gap: theme.spacing['2'] },
  cell: { flex: 1 },
});
