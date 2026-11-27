import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Car, Circle, CreditCard, MapPin, MapPinned } from 'lucide-react-native';
import type { ApiError } from '@vuumbora/api-client';
import { canRequestRide } from '@vuumbora/domain/passenger';
import {
  AppShell,
  FooterActions,
  InlineAlert,
  LinkButton,
  LoadingSkeleton,
  MockBadge,
  MoneyText,
  NetworkBanner,
  PrimaryButton,
  ScreenHeader,
  SectionHeader,
  SurfaceRaised,
  theme,
  textStyle,
  tokens,
  useNetworkStatus,
} from '@vuumbora/ui';
import { RouteSummaryRow } from '../../src/components/confirmation/RouteSummaryRow';
import { PaymentMethodOption } from '../../src/components/confirmation/PaymentMethodOption';
import { MOCK_PAYMENT_METHODS } from '../../src/data/mockPaymentMethods';
import { useDevGeoParams } from '../../src/dev/devGeo';
import { useDevRideSeed } from '../../src/dev/useDevRideSeed';
import { formatDistanceM, formatDurationS } from '../../src/geo/geoFormat';
import { describeGeoProblem, type GeoProblemView } from '../../src/geo/geoProblems';
import { goBackOr } from '../../src/navigation/goBack';
import { useSession } from '../../src/session/SessionProvider';
import { selectedFareQuote, toRideDraft, useRideRequestStore } from '../../src/store/useRideRequestStore';
import { formatClockTime } from '../../src/utils/time';
import { categoryName } from '../../src/utils/rideQuoteFormatting';

/**
 * P06 — Confirmação da corrida (`docs/fichas-de-tela/P06-confirmacao.md`). PP-3 (P05+P06 num painel só) continua não
 * adotado: tela separada, `AppShell scroll glow`, um cartão só e um selo embaixo dele.
 *
 * Fatia G6:
 * - categoria, preço e rota vêm da cotação ASSINADA escolhida na P05 (nunca de texto local, aceite D2);
 * - o preço é FECHADO na cotação (D-06): rótulo "Preço" e, no rodapé, até quando ele vale (`expiresAt`, 5 min, N9). A
 *   frase "o valor final pode mudar" saiu, como a própria ficha §7 previa para preço fechado;
 * - selo "tarifa de teste" quando a versão da tarifa é de teste (`isTestFare`, N8);
 * - antes de pedir, confere a cotação no servidor (`confirmSelectedQuote` → `getQuote`, a checagem que o
 *   `POST /v1/trips` fará no M5): vencida ou sumida, cota de novo, avisa "O preço foi atualizado" e pede o segundo toque.
 */
export default function ConfirmationScreen() {
  useDevGeoParams('getQuote'); // antes do seed: o cenário de erro vale para a conferência do "Solicitar"
  useDevRideSeed();

  const { signOut } = useSession();
  const online = useNetworkStatus();
  const origin = useRideRequestStore((state) => state.origin);
  const destination = useRideRequestStore((state) => state.destination);
  const categoryId = useRideRequestStore((state) => state.categoryId);
  const paymentMethodId = useRideRequestStore((state) => state.paymentMethodId);
  const fareQuotes = useRideRequestStore((state) => state.fareQuotes);
  const quoteRoute = useRideRequestStore((state) => state.quoteRoute);
  const quoteStatus = useRideRequestStore((state) => state.quoteStatus);
  const quoteError = useRideRequestStore((state) => state.quoteError);
  const priceUpdated = useRideRequestStore((state) => state.priceUpdated);
  const categoryInfo = useRideRequestStore((state) => state.categoryInfo);
  const setPaymentMethod = useRideRequestStore((state) => state.setPaymentMethod);
  const confirmSelectedQuote = useRideRequestStore((state) => state.confirmSelectedQuote);
  const acknowledgePriceUpdate = useRideRequestStore((state) => state.acknowledgePriceUpdate);
  const requestRide = useRideRequestStore((state) => state.requestRide);

  const [submitting, setSubmitting] = useState(false);
  const [sendError, setSendError] = useState<ApiError | undefined>(undefined);

  const quote = selectedFareQuote({ fareQuotes, categoryId });
  const quoting = quoteStatus === 'loading';
  const canRequest = canRequestRide(toRideDraft({ origin, destination, categoryId, paymentMethodId })) && quote !== undefined && !quoting;

  const missing: string[] = [];
  if (!origin) missing.push('origem');
  if (!destination) missing.push('destino');
  if (!categoryId) missing.push('categoria');
  if (!paymentMethodId) missing.push('forma de pagamento');

  const problem: GeoProblemView | undefined = sendError
    ? describeGeoProblem(sendError, 'confirm')
    : quoteStatus === 'error' && quoteError
      ? describeGeoProblem(quoteError, 'quote')
      : undefined;

  async function handleRequest() {
    // Segundo toque durante o envio é ignorado (ficha §5, "Carregando ação").
    if (!canRequest || submitting || !online) return;
    setSubmitting(true);
    setSendError(undefined);
    const outcome = await confirmSelectedQuote();
    if (outcome.status === 'ok') {
      acknowledgePriceUpdate();
      requestRide();
      router.replace('/corrida');
      return;
    }
    setSubmitting(false);
    if (outcome.status === 'error') setSendError(outcome.error);
    // `price_updated`: a store já cotou de novo e marcou o aviso; o próximo toque segue com o preço novo.
  }

  function handleProblemAction() {
    if (!problem) return;
    switch (problem.action) {
      case 'retry':
        setSendError(undefined);
        if (quoteStatus === 'error') useRideRequestStore.getState().refreshQuote();
        return;
      case 'requote':
        setSendError(undefined);
        useRideRequestStore.getState().refreshQuote({ priceUpdated: true });
        return;
      case 'change_route':
        goBackOr('/destino');
        return;
      case 'home':
        router.replace('/');
        return;
      case 'sign_in':
        void signOut();
        return;
    }
  }

  const blockedReason = !online ? 'sem conexão' : quoting ? 'atualizando o preço' : `falta escolher ${missing.join(', ') || 'a categoria'}`;
  const selo = quote?.isTestFare ? 'tarifa de teste' : 'corrida de demonstração';

  return (
    <AppShell
      scroll
      glow
      footer={
        // G-11: o CTA fica fixo no rodapé (o cartão + a lista de pagamento passam da dobra em 320×568).
        <FooterActions testID="confirmation-footer">
          {missing.length > 0 ? (
            <InlineAlert tone="warning" message={`Falta escolher: ${missing.join(', ')}.`} testID="confirmation-missing-alert" />
          ) : null}
          {priceUpdated && !quoting && quote ? (
            <InlineAlert tone="info" title="O preço foi atualizado." message="Confira o valor novo antes de solicitar." announce testID="confirmation-price-updated" />
          ) : null}
          {problem ? (
            <View style={styles.problem}>
              <InlineAlert tone="danger" title={problem.title} message={problem.description} announce testID={`confirmation-problem-${problem.key}`} />
              <LinkButton label={problem.actionLabel} onPress={handleProblemAction} role="button" align="flex-start" testID="confirmation-problem-action" />
            </View>
          ) : null}
          <PrimaryButton
            label="Solicitar corrida"
            icon={<Car size={20} color={theme.role.ctaText} strokeWidth={2.25} />}
            onPress={() => void handleRequest()}
            disabled={!canRequest || !online}
            loading={submitting}
            accessibilityLabel={canRequest && online ? 'Solicitar corrida' : `Solicitar corrida, indisponível: ${blockedReason}`}
            testID="request-ride-button"
          />
          <Text style={styles.footerNote} testID="confirmation-footer-note">
            {!online ? 'Sem conexão' : quote ? `Preço fechado: vale até ${formatClockTime(new Date(quote.expiresAt))}.` : ' '}
          </Text>
        </FooterActions>
      }
    >
      <View style={styles.content}>
        <ScreenHeader title="Confirme sua corrida" subtitle="Confira antes de solicitar" onBack={() => goBackOr('/categoria')} testID="confirmation-header" />
        <NetworkBanner testID="confirmation-network-banner" />

        <SurfaceRaised style={styles.card}>
          <RouteSummaryRow
            icon={<Circle size={14} color={tokens.color.map.pickup} fill={tokens.color.map.pickup} />}
            label="Origem"
            value={origin?.address ?? 'Não definida'}
            testID="confirmation-origin"
          />
          <View style={styles.divider} />
          <RouteSummaryRow
            icon={<MapPin size={16} color={tokens.color.map.destination} fill={tokens.color.map.destination} strokeWidth={1.5} />}
            label="Destino"
            value={destination?.address ?? 'Não definido'}
            testID="confirmation-destination"
          />
          {quoteRoute && !quoting ? (
            <View style={styles.routeRow} testID="confirmation-route-summary">
              <MapPinned size={14} color={theme.role.textSecondary} strokeWidth={2} />
              <Text style={styles.routeText}>
                {formatDistanceM(quoteRoute.distanceM)} · cerca de {formatDurationS(quoteRoute.durationS)} de viagem
              </Text>
            </View>
          ) : null}
          <View style={styles.divider} />
          {quoting ? (
            <View testID="confirmation-quoting" accessibilityLabel="Atualizando o preço">
              <LoadingSkeleton variant="block" height={56} lines={1} />
            </View>
          ) : quote ? (
            <View style={styles.categoryRow}>
              <Car size={24} color={theme.role.textSecondary} strokeWidth={1.75} />
              <View style={styles.categoryTextBlock}>
                <Text style={styles.categoryName}>{categoryName(quote.categorySlug, categoryInfo)}</Text>
                {/* N2 da tela (ficha §3): rótulo pequeno em cima, número grande e tabular embaixo. Preço FECHADO (D-06). */}
                <MoneyText value={quote.priceCents / 100} label="Preço" size="heading" testID="confirmation-price" />
              </View>
            </View>
          ) : (
            <Text style={styles.helperText}>Nenhuma categoria selecionada. Volte e escolha uma na tela anterior.</Text>
          )}
          <View style={styles.divider} />
          <RouteSummaryRow
            icon={<CreditCard size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Pagamento"
            value={MOCK_PAYMENT_METHODS.find((m) => m.id === paymentMethodId)?.label ?? 'Não escolhida'}
            testID="confirmation-payment"
          />
        </SurfaceRaised>
        {/* Um selo só, embaixo do cartão (ficha §2). Com tarifa de teste, é ELA que precisa ficar clara. */}
        <MockBadge label={selo} testID={quote?.isTestFare ? 'confirmation-test-fare-badge' : 'confirmation-mock-badge'} />

        <View style={styles.section}>
          <SectionHeader title="Forma de pagamento" testID="payment-section-header" />
          <View style={styles.paymentList}>
            {MOCK_PAYMENT_METHODS.map((method) => (
              <PaymentMethodOption
                key={method.id}
                label={method.label}
                description={method.description}
                selected={paymentMethodId === method.id}
                onPress={() => setPaymentMethod(method.id)}
                testID={`payment-method-${method.id}`}
              />
            ))}
          </View>
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    // Borda iluminada de cima (direção de arte §4/§9 item 2) — `SurfaceRaised` dá o fundo gradiente.
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['3'],
  },
  divider: { height: 1, backgroundColor: theme.role.border },
  section: { gap: theme.spacing['2'] },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['1'] },
  routeText: { flexShrink: 1, color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'] },
  categoryTextBlock: { flex: 1 },
  categoryName: { color: theme.role.textPrimary, ...textStyle('semibold', 'body') },
  paymentList: { gap: theme.spacing['2'] },
  problem: { gap: theme.spacing['1'] },
  helperText: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
  footerNote: { color: theme.role.textMuted, ...textStyle('regular', 'caption'), textAlign: 'center' },
});
