import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CheckCircle, LifeBuoy, Receipt, Star } from 'lucide-react-native';
import {
  AppShell,
  FooterActions,
  LinkButton,
  ListRow,
  MockBadge,
  PrimaryButton,
  StarRating,
  SurfaceRaised,
  TextInput,
  Toast,
  theme,
  textStyle,
  tabularNums,
  withAlpha,
  type StarRatingIconProps,
} from '@vuumbora/ui';

// Auditoria F3: estrela em ícone lucide (não mais o glifo ★/☆ do sistema).
const starIcon = ({ filled, size, color }: StarRatingIconProps) => (
  <Star size={size} color={color} fill={filled ? color : 'none'} strokeWidth={1.75} />
);
import { MOCK_PAYMENT_METHODS } from '../../src/data/mockPaymentMethods';
import { formatMoneyBRL } from '../../src/utils/money';
import { useRideRequestStore } from '../../src/store/useRideRequestStore';
import { useDevRidePhaseOverride, isDevRidePhaseParam } from '../../src/dev/useDevRidePhaseOverride';

const COMMENT_MAX_LENGTH = 500;

/**
 * P10 — Viagem concluída (`docs/fichas-de-tela/P10-viagem-concluida.md`, onda 4). Fica FORA da
 * rota única `/corrida` (PP-10: "a P10 fica à parte" — a corrida já acabou, não é mais um
 * estado dela). Valor e comprovante são 100% FABRICADOS (sem `PaymentPort` real) — sinalizados
 * com `MockBadge`. Avaliação é guardada só localmente (`submitRating`, sem backend).
 *
 * Lacunas do protótipo corrigidas (ficha §11): 2 `PrimaryButton` na mesma tela → 1 CTA por
 * estado (§11.1); comprovante repetido com linhas fabricadas ("Taxa de serviço" etc., D-38) →
 * só total + forma de pagamento, atrás de UMA linha "Ver comprovante" (§11.3); "Preciso de
 * ajuda" sem ação → `ListRow` real para `/ajuda` (§11.2); sem `ScreenHeader` (não há pra onde
 * voltar, D-32 da mesma régua das telas de corrida).
 */
export default function TripCompletedScreen() {
  // `?devPhase=completed`: a captura de tela (`tools/qualidade-tela`) chega aqui sem passar
  // pela corrida inteira — mesmo atalho de `/corrida` (ver `useDevRidePhaseOverride.ts`).
  useDevRidePhaseOverride();
  const { devPhase, devRated } = useLocalSearchParams<{ devPhase?: string; devRated?: string }>();
  const devPhasePending = __DEV__ && typeof devPhase === 'string' && isDevRidePhaseParam(devPhase);

  const phase = useRideRequestStore((state) => state.phase);
  const destination = useRideRequestStore((state) => state.destination);
  const assignedDriver = useRideRequestStore((state) => state.assignedDriver);
  const receipt = useRideRequestStore((state) => state.receipt);
  const paymentMethodId = useRideRequestStore((state) => state.paymentMethodId);
  const rating = useRideRequestStore((state) => state.rating);
  const ratingSubmitted = useRideRequestStore((state) => state.ratingSubmitted);
  const submitRating = useRideRequestStore((state) => state.submitRating);
  const startNewRide = useRideRequestStore((state) => state.startNewRide);

  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [receiptExpanded, setReceiptExpanded] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  // `?devRated=1` (só com `devPhase=completed`): captura o estado "avaliada" sem precisar
  // simular o toque nas estrelas — mesmo espírito do `?devPhase`, SÓ `__DEV__`.
  useEffect(() => {
    if (!__DEV__ || devRated !== '1' || !receipt || ratingSubmitted) return;
    submitRating(5, 'Ótima viagem!');
  }, [devRated, receipt, ratingSubmitted, submitRating]);

  useEffect(() => {
    if (phase === 'completed' || devPhasePending) return;
    if (phase === 'in_progress') {
      router.replace('/corrida');
      return;
    }
    if (phase === 'driver_assigned' || phase === 'driver_en_route' || phase === 'driver_arrived') {
      router.replace('/corrida');
      return;
    }
    if (phase === 'searching_driver' || phase === 'requested') {
      router.replace('/corrida');
      return;
    }
    router.replace('/');
  }, [phase, devPhasePending]);

  if (phase !== 'completed' || !receipt) {
    return <AppShell testID="trip-completed-redirecting">{null}</AppShell>;
  }

  const paymentLabel = MOCK_PAYMENT_METHODS.find((method) => method.id === paymentMethodId)?.label ?? 'forma não informada';
  const driverFirstName = assignedDriver?.name ?? 'o motorista';

  function handleSubmitRating() {
    if (stars === 0) return;
    submitRating(stars, comment);
    setToastVisible(true);
  }

  function handleBackHome() {
    startNewRide();
    router.replace('/');
  }

  return (
    <AppShell
      scroll
      glow
      footer={
        // G-11: o CTA do estado visível sem rolar em 320×568 (ficha §2/§13).
        <FooterActions testID="trip-completed-footer">
          {ratingSubmitted ? (
            <PrimaryButton label="Voltar ao início" onPress={handleBackHome} accessibilityLabel="Voltar para a tela inicial" testID="back-home-button" />
          ) : (
            <>
              <PrimaryButton
                label="Enviar avaliação"
                onPress={handleSubmitRating}
                disabled={stars === 0}
                accessibilityLabel={stars === 0 ? 'Enviar avaliação, indisponível: escolha de 1 a 5 estrelas' : 'Enviar avaliação da corrida'}
                testID="submit-rating-button"
              />
              <LinkButton label="Agora não" onPress={handleBackHome} accessibilityLabel="Avaliar depois, voltar para a tela inicial" testID="skip-rating-link" />
            </>
          )}
        </FooterActions>
      }
    >
      <View style={styles.content}>
        <View style={styles.successBadge} accessibilityElementsHidden importantForAccessibility="no">
          <CheckCircle size={32} color={theme.role.success} strokeWidth={1.75} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Corrida concluída
        </Text>
        {destination ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {destination.address}
          </Text>
        ) : null}

        <SurfaceRaised style={styles.fareCard} testID="final-fare-card">
          <Text style={styles.fareLabel}>Valor final</Text>
          <Text style={styles.fareValue} numberOfLines={1}>
            {formatMoneyBRL(receipt.total)}
          </Text>
          <Text style={styles.farePayment}>Pago com {paymentLabel}</Text>
        </SurfaceRaised>
        <MockBadge label="valor de demonstração" testID="fare-mock-badge" />

        {ratingSubmitted && rating ? (
          <View style={styles.ratingDoneRow} testID="rating-submitted">
            <StarRating value={rating.stars} size={16} icon={starIcon} testID="submitted-rating-display" />
            <Text style={styles.ratingDoneText}>Sua avaliação</Text>
          </View>
        ) : (
          <View style={styles.ratingSection}>
            <Text style={styles.sectionTitle}>Como foi a corrida com {driverFirstName}?</Text>
            <StarRating value={stars} onChange={setStars} size={32} icon={starIcon} accessibilityLabel="Avaliar a corrida de 1 a 5 estrelas" testID="rating-input" />
            {stars > 0 ? (
              <TextInput
                label="Comentário (opcional)"
                value={comment}
                onChangeText={(next) => setComment(next.slice(0, COMMENT_MAX_LENGTH))}
                placeholder="Conte como foi a viagem"
                accessibilityLabel="Comentário sobre a corrida"
                testID="rating-comment-input"
              />
            ) : null}
            {stars > 0 && comment.length > 0 ? (
              <Text style={styles.commentCounter}>
                {comment.length}/{COMMENT_MAX_LENGTH}
              </Text>
            ) : null}
          </View>
        )}

        <View style={styles.listSection}>
          <ListRow
            icon={<Receipt size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Ver comprovante"
            {...(receiptExpanded ? {} : { value: formatMoneyBRL(receipt.total) })}
            onPress={() => setReceiptExpanded((prev) => !prev)}
            accessibilityLabel={receiptExpanded ? 'Recolher comprovante' : `Ver comprovante, total ${formatMoneyBRL(receipt.total)}`}
            testID="receipt-row"
          />
          {receiptExpanded ? (
            <SurfaceRaised style={styles.receiptDetail} testID="receipt-detail">
              <View style={styles.receiptLine}>
                <Text style={styles.receiptLabel}>Total</Text>
                <Text style={styles.receiptValue}>{formatMoneyBRL(receipt.total)}</Text>
              </View>
              <View style={styles.receiptLine}>
                <Text style={styles.receiptLabel}>Pagamento</Text>
                <Text style={styles.receiptValue}>{paymentLabel}</Text>
              </View>
              <MockBadge label="comprovante de demonstração" testID="receipt-mock-badge" />
            </SurfaceRaised>
          ) : null}

          <ListRow
            icon={<LifeBuoy size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Ajuda com esta corrida"
            onPress={() => router.push('/ajuda')}
            accessibilityLabel="Ajuda com esta corrida"
            testID="help-with-trip-row"
          />
        </View>
      </View>

      <Toast message="Avaliação enviada." visible={toastVisible} onDismiss={() => setToastVisible(false)} testID="rating-sent-toast" />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['3'], alignItems: 'center' },
  successBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withAlpha(theme.role.success, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: theme.role.textPrimary, ...textStyle('bold', 'title'), textAlign: 'center' },
  subtitle: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
  fareCard: {
    width: '100%',
    alignItems: 'center',
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['1'],
  },
  fareLabel: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  fareValue: { color: theme.role.textPrimary, ...textStyle('bold', 'display'), ...tabularNums },
  farePayment: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  ratingSection: { width: '100%', alignItems: 'center', gap: theme.spacing['3'] },
  sectionTitle: { color: theme.role.textPrimary, ...textStyle('bold', 'body'), textAlign: 'center' },
  commentCounter: { alignSelf: 'flex-end', color: theme.role.textMuted, ...textStyle('regular', 'caption'), ...tabularNums },
  ratingDoneRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['2'] },
  ratingDoneText: { color: theme.role.textSecondary, ...textStyle('medium', 'small') },
  listSection: { width: '100%', gap: theme.spacing['2'] },
  receiptDetail: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['2'],
  },
  receiptLine: { flexDirection: 'row', justifyContent: 'space-between' },
  receiptLabel: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  receiptValue: { color: theme.role.textPrimary, ...textStyle('semibold', 'small'), ...tabularNums },
});
