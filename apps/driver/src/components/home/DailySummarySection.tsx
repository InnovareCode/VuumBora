import { memo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BarChart3, Car, Star, Wallet } from 'lucide-react-native';
import { MetricCard, MockBadge, theme, textStyle } from '@vuumbora/ui';

export interface DailySummarySectionProps {
  readonly earningsLabel: string;
  readonly ridesLabel: string;
  readonly ratingLabel: string;
  readonly acceptanceLabel: string;
}

const ICON_SIZE = 18;

/**
 * Quatro métricas do dia (ganhos, corridas, avaliação, taxa de aceitação). Todas são
 * DEMONSTRAÇÃO (MOTORISTA.md: "exibir ganhos como valores reais retornados pela API;
 * não codificar... cifras dos mockups" — não existe API ainda, então um `MockBadge`
 * cobre o grupo inteiro, igual ao padrão já usado em "Escolha sua viagem" do
 * passageiro). Reaproveita `MetricCard` de `@vuumbora/ui` (props `icon`/`compact`
 * novas, adicionadas nesta tela — ver referência motorista-home-alvo.webp item 1).
 * **Linha única de 4 a partir de 360px** (medido: ~74pt por card, mesma faixa que já
 * funciona para `QuickActionsRow`); abaixo disso cai para 2×2 — card mais apertado
 * do app, por isso `compact` + ícone pequeno (18px) + rótulo em até 2 linhas.
 */
export const DailySummarySection = memo(function DailySummarySection({
  earningsLabel,
  ridesLabel,
  ratingLabel,
  acceptanceLabel,
}: DailySummarySectionProps) {
  const { width } = useWindowDimensions();
  const fourInRow = width >= 360;

  // Ícones alternam dourado (destaque de marca) / cinza (textSecondary) — mesmo
  // ritmo visual da referência (carteira dourada, carro claro, estrela dourada,
  // gráfico claro). Nunca fundo amarelo — só o traço do ícone (regra de cor §7).
  const earningsCard = (
    <MetricCard
      icon={<Wallet size={ICON_SIZE} color={theme.role.ctaBackground} strokeWidth={1.75} />}
      label="Ganhos hoje"
      value={earningsLabel}
      trend="up"
      compact
      testID="metric-earnings"
    />
  );
  const ridesCard = (
    <MetricCard
      icon={<Car size={ICON_SIZE} color={theme.role.textSecondary} strokeWidth={1.75} />}
      label="Corridas hoje"
      value={ridesLabel}
      compact
      testID="metric-rides"
    />
  );
  const ratingCard = (
    <MetricCard
      icon={<Star size={ICON_SIZE} color={theme.role.ctaBackground} strokeWidth={1.75} fill={theme.role.ctaBackground} />}
      label="Avaliação"
      value={ratingLabel}
      compact
      testID="metric-rating"
    />
  );
  const acceptanceCard = (
    <MetricCard
      icon={<BarChart3 size={ICON_SIZE} color={theme.role.textSecondary} strokeWidth={1.75} />}
      label="Taxa de aceitação"
      value={acceptanceLabel}
      trend="up"
      compact
      testID="metric-acceptance"
    />
  );

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>Resumo de hoje</Text>
        <MockBadge label="valores de exemplo" />
      </View>
      {fourInRow ? (
        <View style={styles.row}>
          <View style={styles.cell}>{earningsCard}</View>
          <View style={styles.cell}>{ridesCard}</View>
          <View style={styles.cell}>{ratingCard}</View>
          <View style={styles.cell}>{acceptanceCard}</View>
        </View>
      ) : (
        <>
          <View style={styles.row}>
            <View style={styles.cell}>{earningsCard}</View>
            <View style={styles.cell}>{ridesCard}</View>
          </View>
          <View style={styles.row}>
            <View style={styles.cell}>{ratingCard}</View>
            <View style={styles.cell}>{acceptanceCard}</View>
          </View>
        </>
      )}
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
