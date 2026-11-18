import { memo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Clock, MapPin, User, Zap } from 'lucide-react-native';
import { MockBadge, PrimaryButton, SecondaryButton, theme, textStyle, tabularNums, tokens } from '@vuumbora/ui';

export interface NewRideOfferCardProps {
  /** Dado de DEMONSTRAÇÃO — nenhuma oferta real existe sem backend. */
  readonly passengerName: string;
  readonly pickupDistanceLabel: string;
  readonly pickupAddress: string;
  readonly destinationLabel: string;
  readonly priceLabel: string;
  readonly surgeLabel?: string;
  /** Contador LOCAL, só de demonstração — ver nota no corpo do componente. */
  readonly secondsRemaining: number;
  readonly onAccept: () => void;
  readonly onDecline: () => void;
}

/**
 * Card de nova oferta de corrida. Duas regras de domínio (MOTORISTA.md) importam aqui,
 * não só a aparência:
 * 1. "Oferta deve expirar no servidor; contador visual não é fonte de verdade" — o
 *    `secondsRemaining` vem de um timer local no componente pai, só para DEMONSTRAR
 *    a interação; por isso o `MockBadge` ao lado do relógio deixa explícito que quem
 *    decide a expiração de verdade é o servidor, não esta contagem.
 * 2. "Aceite precisa ser atômico" — `onAccept`/`onDecline` são só callbacks: a tela
 *    não assume sucesso otimista nem resolve a corrida sozinha (isso é tarefa da Vega
 *    quando o endpoint existir).
 * Nome do passageiro, endereços, distância, valor e "Dinâmica +20%" são todos dado
 * fabricado — um único `MockBadge` cobre o bloco inteiro (mesmo padrão do
 * `SafetyPromoBanner` do passageiro: vários pontos fabricados, um selo por bloco),
 * agora abaixo das DUAS colunas (não só da coluna de rota).
 * **Duas colunas a partir de 360px** (rota à esquerda, valor estimado à direita —
 * referência motorista-home-alvo.webp item 2); abaixo disso empilha (rota, depois
 * valor com divisor), porque "Valor estimado" + "R$ 32,40" + selo de dinâmica
 * precisam de ~120pt mínimos e não sobram ao lado da rota em 320/340px.
 */
export const NewRideOfferCard = memo(function NewRideOfferCard({
  passengerName,
  pickupDistanceLabel,
  pickupAddress,
  destinationLabel,
  priceLabel,
  surgeLabel,
  secondsRemaining,
  onAccept,
  onDecline,
}: NewRideOfferCardProps) {
  const { width } = useWindowDimensions();
  const twoColumn = width >= 360;

  const routeColumn = (
    <View style={[styles.routeBlock, twoColumn && styles.routeBlockTwoCol]}>
      <View style={styles.routeRow}>
        <View style={[styles.dot, { backgroundColor: tokens.color.map.pickup }]} />
        {/* 2 linhas (não 1): medido (Playwright, 360px) que "2,3 km até o embarque"
            (153px) estourava os ~137px de conteúdo da coluna de rota no modo duas
            colunas — a coluna de valor ao lado consome parte da largura do card. */}
        <Text style={styles.routeDistance} numberOfLines={2}>
          {pickupDistanceLabel}
        </Text>
      </View>
      <View style={styles.routeRow}>
        <User size={16} color={theme.role.textSecondary} strokeWidth={2} />
        <View style={styles.routeTextBlock}>
          <Text style={styles.passengerName} numberOfLines={1}>
            {passengerName}
          </Text>
          <Text style={styles.pickupAddress} numberOfLines={2}>
            {pickupAddress}
          </Text>
        </View>
      </View>
      <View style={styles.routeRow}>
        <MapPin size={16} color={tokens.color.map.destination} strokeWidth={2} />
        <Text style={styles.destinationLabel} numberOfLines={2}>
          Destino: {destinationLabel}
        </Text>
      </View>
    </View>
  );

  const priceColumn = (
    <View style={[styles.priceBlock, twoColumn ? styles.priceBlockTwoCol : styles.priceBlockStacked]}>
      <Text style={styles.priceLabel}>Valor estimado</Text>
      <Text style={styles.priceValue}>{priceLabel}</Text>
      {surgeLabel ? (
        <View style={styles.surgePill}>
          <Zap size={12} color={theme.role.ctaText} strokeWidth={2.5} fill={theme.role.ctaText} />
          <Text style={styles.surgeText}>{surgeLabel}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.card} testID="new-ride-offer-card">
      <View style={styles.headerRow}>
        <View style={styles.offerPill}>
          <Text style={styles.offerPillText}>Nova corrida</Text>
        </View>
        <View style={styles.countdownBlock}>
          <View style={styles.countdownRow}>
            <Clock size={14} color={theme.role.textSecondary} strokeWidth={2} />
            <Text style={styles.countdownText}>{Math.max(secondsRemaining, 0)}s</Text>
          </View>
          {/* Selo junto do que ele qualifica (o contador), não empilhado no topo do card. */}
          <MockBadge label="contador local" />
        </View>
      </View>

      <View style={[styles.offerBody, twoColumn && styles.offerBodyRow]}>
        {routeColumn}
        {priceColumn}
      </View>

      {/* Selo cobrindo o bloco de dados da oferta inteiro (rota + valor) — um por bloco. */}
      <MockBadge label="dados de exemplo" />

      <View style={styles.actionsRow}>
        <View style={styles.actionButton}>
          <SecondaryButton label="Recusar" onPress={onDecline} accessibilityLabel="Recusar corrida" testID="decline-ride-button" />
        </View>
        <View style={styles.actionButton}>
          <PrimaryButton label="Aceitar" onPress={onAccept} accessibilityLabel="Aceitar corrida" testID="accept-ride-button" />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.role.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.role.ctaBackground,
    padding: theme.spacing['3'],
    gap: theme.spacing['3'],
    // Halo amarelo sutil em volta do card (referência motorista-home-alvo.webp —
    // "Nova corrida" é a única oferta ativa, precisa se destacar das outras seções).
    boxShadow: theme.glow.selected,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing['2'] },
  offerPill: {
    backgroundColor: theme.role.ctaBackground,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing['3'],
    paddingVertical: theme.spacing['1'],
  },
  offerPillText: { color: theme.role.ctaText, ...textStyle('bold', 'small') },
  countdownBlock: { alignItems: 'flex-end', gap: 4 },
  countdownRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  countdownText: { color: theme.role.textPrimary, ...textStyle('bold', 'small'), ...tabularNums },
  offerBody: { gap: theme.spacing['3'] },
  // Duas colunas (rota flex:1 | valor largura mínima) — ver nota da função sobre o
  // porquê do corte em 360px.
  offerBodyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing['3'] },
  routeBlock: { gap: theme.spacing['2'] },
  routeBlockTwoCol: { flex: 1 },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing['2'] },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  routeDistance: { color: theme.role.textPrimary, ...textStyle('semibold', 'small') },
  routeTextBlock: { flex: 1, gap: 1 },
  passengerName: { color: theme.role.textPrimary, ...textStyle('bold', 'body') },
  pickupAddress: { color: theme.role.textSecondary, ...textStyle('regular', 'caption') },
  destinationLabel: { flex: 1, color: theme.role.textPrimary, ...textStyle('semibold', 'small') },
  priceBlock: { gap: 4 },
  // Empilhado (<360px): vira uma linha horizontal com divisor acima, igual ao
  // desenho original (rótulo+valor à esquerda, selo de dinâmica à direita).
  priceBlockStacked: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing['2'],
    borderTopWidth: 1,
    borderTopColor: theme.role.border,
    paddingTop: theme.spacing['2'],
  },
  // Duas colunas (>=360px): bloco vertical à direita da rota, largura mínima
  // compatível com "R$ 32,40" em 'title' (22px) + selo de dinâmica abaixo.
  priceBlockTwoCol: { minWidth: 118, alignItems: 'flex-start' },
  priceLabel: { color: theme.role.textSecondary, ...textStyle('regular', 'caption') },
  priceValue: { color: theme.role.textPrimary, ...textStyle('bold', 'title'), ...tabularNums },
  surgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.role.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.role.ctaBackground,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing['2'],
    paddingVertical: 4,
  },
  surgeText: { color: theme.role.ctaBackground, ...textStyle('bold', 'caption') },
  actionsRow: { flexDirection: 'row', gap: theme.spacing['2'] },
  actionButton: { flex: 1 },
});
