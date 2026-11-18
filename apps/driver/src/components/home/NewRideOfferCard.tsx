import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
 * `SafetyPromoBanner` do passageiro: vários pontos fabricados, um selo por bloco).
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
  return (
    <View style={styles.card} testID="new-ride-offer-card">
      <View style={styles.headerRow}>
        <View style={styles.offerPill}>
          <Text style={styles.offerPillText}>Nova corrida</Text>
        </View>
        <View style={styles.countdownRow}>
          <Clock size={14} color={theme.role.textSecondary} strokeWidth={2} />
          <Text style={styles.countdownText}>{Math.max(secondsRemaining, 0)}s</Text>
        </View>
      </View>
      <View style={styles.countdownMockRow}>
        <MockBadge label="contador local" />
      </View>

      <View style={styles.bodyMockRow}>
        <MockBadge label="dados de exemplo" />
      </View>

      <View style={styles.routeBlock}>
        <View style={styles.routeRow}>
          <View style={[styles.dot, { backgroundColor: tokens.color.map.pickup }]} />
          <Text style={styles.routeDistance} numberOfLines={1}>
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
          <Text style={styles.destinationLabel} numberOfLines={1}>
            Destino: {destinationLabel}
          </Text>
        </View>
      </View>

      <View style={styles.priceRow}>
        <View style={styles.priceBlock}>
          <Text style={styles.priceLabel}>Valor estimado</Text>
          <Text style={styles.priceValue}>{priceLabel}</Text>
        </View>
        {surgeLabel ? (
          <View style={styles.surgePill}>
            <Zap size={12} color={theme.role.ctaText} strokeWidth={2.5} fill={theme.role.ctaText} />
            <Text style={styles.surgeText}>{surgeLabel}</Text>
          </View>
        ) : null}
      </View>

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
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing['2'] },
  offerPill: {
    backgroundColor: theme.role.ctaBackground,
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing['3'],
    paddingVertical: theme.spacing['1'],
  },
  offerPillText: { color: theme.role.ctaText, ...textStyle('bold', 'small') },
  countdownRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  countdownText: { color: theme.role.textPrimary, ...textStyle('bold', 'small'), ...tabularNums },
  countdownMockRow: { alignItems: 'flex-end' },
  bodyMockRow: { alignSelf: 'flex-start' },
  routeBlock: { gap: theme.spacing['2'] },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing['2'] },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  routeDistance: { color: theme.role.textPrimary, ...textStyle('semibold', 'small') },
  routeTextBlock: { flex: 1, gap: 1 },
  passengerName: { color: theme.role.textPrimary, ...textStyle('bold', 'body') },
  pickupAddress: { color: theme.role.textSecondary, ...textStyle('regular', 'caption') },
  destinationLabel: { flex: 1, color: theme.role.textPrimary, ...textStyle('semibold', 'small') },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: theme.spacing['2'],
    borderTopWidth: 1,
    borderTopColor: theme.role.border,
    paddingTop: theme.spacing['2'],
  },
  priceBlock: { gap: 2 },
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
