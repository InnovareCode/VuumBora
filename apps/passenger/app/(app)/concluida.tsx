import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LifeBuoy, MapPin, Star } from 'lucide-react-native';
import {
  AppShell,
  MockBadge,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
  StarRating,
  StatusBadge,
  SurfaceRaised,
  TextInput,
  theme,
  textStyle,
  tabularNums,
  type StarRatingIconProps,
} from '@vuumbora/ui';

// Auditoria F3: estrela em ícone lucide (não mais o glifo ★/☆ do sistema).
const starIcon = ({ filled, size, color }: StarRatingIconProps) => (
  <Star size={size} color={color} fill={filled ? color : 'none'} strokeWidth={1.75} />
);
import { ReceiptBreakdownRow } from '../../src/components/trip/ReceiptBreakdownRow';
import { formatMoneyBRL } from '../../src/utils/money';
import { useRideRequestStore } from '../../src/store/useRideRequestStore';

/**
 * P10 — Corrida concluída. Sem mockup de referência (derivada do design system).
 * Valor final e comprovante são 100% FABRICADOS (sem `PaymentPort` real) — sinalizados
 * com `MockBadge`. Avaliação é guardada só localmente (`submitRating`, sem backend).
 */
export default function TripCompletedScreen() {
  const phase = useRideRequestStore((state) => state.phase);
  const destination = useRideRequestStore((state) => state.destination);
  const assignedDriver = useRideRequestStore((state) => state.assignedDriver);
  const receipt = useRideRequestStore((state) => state.receipt);
  const rating = useRideRequestStore((state) => state.rating);
  const ratingSubmitted = useRideRequestStore((state) => state.ratingSubmitted);
  const submitRating = useRideRequestStore((state) => state.submitRating);
  const startNewRide = useRideRequestStore((state) => state.startNewRide);

  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (phase === 'completed') return;
    if (phase === 'in_progress') {
      router.replace('/em-andamento');
      return;
    }
    if (phase === 'driver_assigned' || phase === 'driver_en_route' || phase === 'driver_arrived') {
      router.replace('/a-caminho');
      return;
    }
    if (phase === 'searching_driver' || phase === 'requested') {
      router.replace('/buscando');
      return;
    }
    router.replace('/');
  }, [phase]);

  if (phase !== 'completed' || !receipt) {
    return <AppShell testID="trip-completed-redirecting">{null}</AppShell>;
  }

  function handleSubmitRating() {
    if (stars === 0) return;
    submitRating(stars, comment);
  }

  function handleBackHome() {
    startNewRide();
    router.replace('/');
  }

  return (
    <AppShell scroll glow>
      <View style={styles.content}>
        {/* Título curto ("Concluída", não "Corrida concluída"): medido (Playwright,
            320px) que a versão longa não cabia numa linha só no título do
            ScreenHeader (numberOfLines={1} fixo no componente). */}
        <ScreenHeader title="Concluída" testID="trip-completed-header" />

        {/* Marca de sucesso (auditoria Apolo F5): a tela de fechamento não tinha nenhum
            selo de status, ao contrário de a-caminho/em-andamento. */}
        <View style={styles.successRow}>
          <StatusBadge variant="success" label="Corrida concluída" testID="trip-completed-badge" />
        </View>

        {destination ? (
          // numberOfLines={2} (não subtitle do ScreenHeader, que é 1 linha fixa):
          // medido (Playwright) que o endereço completo nunca cabe em 1 linha, nem a
          // 430px — truncaria informação do destino.
          <View style={styles.destinationRow}>
            <MapPin size={14} color={theme.role.warning} strokeWidth={2} fill={theme.role.warning} />
            <Text style={styles.destinationText} numberOfLines={2}>
              {destination.address}
            </Text>
          </View>
        ) : null}

        <SurfaceRaised style={styles.fareCard} testID="final-fare-card">
          <View style={styles.fareHeader}>
            <Text style={styles.fareLabel}>Valor final</Text>
            <MockBadge label="valor fabricado" />
          </View>
          <Text style={styles.fareValue} numberOfLines={1}>
            {formatMoneyBRL(receipt.total)}
          </Text>
        </SurfaceRaised>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Comprovante</Text>
            <MockBadge label="comprovante fabricado" />
          </View>
          <SurfaceRaised style={styles.receiptCard} testID="receipt-card">
            {receipt.lines.map((line) => (
              <ReceiptBreakdownRow key={line.label} label={line.label} value={formatMoneyBRL(line.amount)} />
            ))}
            <View style={styles.divider} />
            <ReceiptBreakdownRow label="Total" value={formatMoneyBRL(receipt.total)} emphasis testID="receipt-total-row" />
          </SurfaceRaised>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Avalie {assignedDriver?.name ?? 'o motorista'}</Text>
          {ratingSubmitted && rating ? (
            <View style={styles.ratingDoneCard} testID="rating-submitted">
              <StarRating value={rating.stars} icon={starIcon} testID="submitted-rating-display" />
              <Text style={styles.ratingDoneText}>Obrigada pela avaliação!</Text>
            </View>
          ) : (
            <SurfaceRaised style={styles.ratingCard}>
              <StarRating value={stars} onChange={setStars} icon={starIcon} accessibilityLabel="Avaliar a corrida de 1 a 5 estrelas" testID="rating-input" />
              <TextInput
                label="Comentário (opcional)"
                value={comment}
                onChangeText={setComment}
                placeholder="Conte como foi a viagem"
                accessibilityLabel="Comentário sobre a corrida"
                testID="rating-comment-input"
              />
              <PrimaryButton
                label="Enviar avaliação"
                onPress={handleSubmitRating}
                disabled={stars === 0}
                accessibilityLabel="Enviar avaliação da corrida"
                testID="submit-rating-button"
              />
            </SurfaceRaised>
          )}
        </View>

        <SecondaryButton
          label="Preciso de ajuda"
          icon={<LifeBuoy size={18} color={theme.role.textPrimary} strokeWidth={1.75} />}
          onPress={() => {}}
          accessibilityLabel="Acessar suporte, recurso de demonstração, sem central de ajuda real"
          testID="support-button"
        />

        <PrimaryButton
          label="Voltar para o início"
          onPress={handleBackHome}
          accessibilityLabel="Voltar para a tela inicial"
          testID="back-home-button"
        />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  successRow: { flexDirection: 'row', alignItems: 'center' },
  destinationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing['2'] },
  destinationText: { flex: 1, color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  // Borda iluminada de cima + gradiente de superfície (direção de arte §4/§9 itens 2/6)
  // — eram os 3 cards legados da auditoria Apolo (item F1): `theme.role.surface` chapado
  // com `theme.role.border` igual nos 4 lados.
  fareCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['1'],
    alignItems: 'center',
  },
  fareHeader: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['2'] },
  fareLabel: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  fareValue: { color: theme.role.textPrimary, ...textStyle('bold', 'heading'), ...tabularNums },
  section: { gap: theme.spacing['2'] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing['2'] },
  sectionTitle: { color: theme.role.textPrimary, ...textStyle('bold', 'body') },
  receiptCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['2'],
  },
  divider: { height: 1, backgroundColor: theme.role.edgeBottom, marginVertical: theme.spacing['1'] },
  ratingCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['3'],
    alignItems: 'center',
  },
  ratingDoneCard: {
    backgroundColor: theme.role.surfaceElevated,
    borderRadius: theme.radius.lg,
    padding: theme.spacing['4'],
    gap: theme.spacing['2'],
    alignItems: 'center',
  },
  ratingDoneText: { color: theme.role.textSecondary, ...textStyle('medium', 'small') },
});
