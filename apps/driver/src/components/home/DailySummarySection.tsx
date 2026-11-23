import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { BarChart3, Car, Star, Wallet } from 'lucide-react-native';
import { MetricCard, theme } from '@vuumbora/ui';

export interface DailySummarySectionProps {
  readonly earningsLabel: string;
  readonly ridesLabel: string;
  readonly ratingLabel: string;
  readonly acceptanceLabel: string;
  /** Cadastro/documentação ainda não aprovados (ficha M05 §2: "as métricas aparecem com '—'"). */
  readonly approved?: boolean;
}

const PLACEHOLDER = '—';

const ICON_SIZE = 20;

/**
 * Grade 2×2 de métricas do dia (ganhos, corridas, avaliação, taxa de aceitação).
 * Reescrita na onda 2 (reorganização, ficha M05 §2/§4):
 * - **Sempre 2×2** nos 4 breakpoints-alvo (320 a 430): a versão anterior virava 4
 *   numa linha só a partir de 360px, contrariando a própria auditoria que mediu
 *   corte de valor até 430px (lacuna 9 da ficha). Sem `useWindowDimensions`: não há
 *   mais variação por largura.
 * - **Ícone 20px, sempre `textSecondary`** (carteira, carro, gráfico) — a carteira
 *   era `ctaBackground` (amarelo) e violava a regra de 1 bloco amarelo por tela
 *   (lacuna 4, M7). A estrela da avaliação segue amarela: é sinal permitido pela
 *   própria regra (§2 do padrão — "estrela de avaliação").
 * - **Sem `trend` (▲/▼) e sem título de seção/selo próprios.** A ficha não mostra
 *   indicador de tendência nesta grade (número antes de enfeite), e o selo de dados
 *   de exemplo virou ÚNICO por tela, logo após a grade (ver `index.tsx`) — a regra
 *   geral é "um selo por bloco", mas a ficha M05 pede explicitamente só um, embaixo
 *   da grade (§2 e §13 desta ficha).
 * - **Sem `compact`:** a ficha pede valor em `subtitle` (não a fonte reduzida do
 *   compacto) e aceita cair para `body` só se medir corte — ainda não medido em
 *   aparelho, só no navegador via `tools/qualidade-tela` (ver handoff).
 */
export const DailySummarySection = memo(function DailySummarySection({
  earningsLabel,
  ridesLabel,
  ratingLabel,
  acceptanceLabel,
  approved = true,
}: DailySummarySectionProps) {
  return (
    <View style={styles.grid}>
      <View style={styles.row}>
        <View style={styles.cell}>
          <MetricCard
            icon={<Wallet size={ICON_SIZE} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Ganhos hoje"
            value={approved ? earningsLabel : PLACEHOLDER}
            testID="metric-earnings"
          />
        </View>
        <View style={styles.cell}>
          <MetricCard
            icon={<Car size={ICON_SIZE} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Corridas hoje"
            value={approved ? ridesLabel : PLACEHOLDER}
            testID="metric-rides"
          />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.cell}>
          <MetricCard
            icon={<Star size={ICON_SIZE} color={theme.role.ctaBackground} strokeWidth={1.75} fill={theme.role.ctaBackground} />}
            label="Avaliação"
            value={approved ? ratingLabel : PLACEHOLDER}
            testID="metric-rating"
          />
        </View>
        <View style={styles.cell}>
          <MetricCard
            icon={<BarChart3 size={ICON_SIZE} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Taxa de aceitação"
            value={approved ? acceptanceLabel : PLACEHOLDER}
            testID="metric-acceptance"
          />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  grid: { gap: theme.spacing['2'] },
  row: { flexDirection: 'row', gap: theme.spacing['2'] },
  cell: { flex: 1 },
});
