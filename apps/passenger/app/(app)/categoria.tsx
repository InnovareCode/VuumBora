import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ArrowRight, CreditCard, MapPinned } from 'lucide-react-native';
import { isQuoteExpired } from '@vuumbora/domain';
import {
  AppShell,
  FooterActions,
  InlineAlert,
  ListRow,
  LoadingSkeleton,
  MockBadge,
  NetworkBanner,
  PrimaryButton,
  SectionHeader,
  theme,
  textStyle,
  useNetworkStatus,
} from '@vuumbora/ui';
import { RouteMapBanner } from '../../src/components/categoria/RouteMapBanner';
import { RideCategoryCard } from '../../src/components/categoria/RideCategoryCard';
import { categoryVisual } from '../../src/components/categoria/categoryVisuals';
import { PaymentMethodOption } from '../../src/components/confirmation/PaymentMethodOption';
import { MOCK_PAYMENT_METHODS } from '../../src/data/mockPaymentMethods';
import { useDevGeoParams } from '../../src/dev/devGeo';
import { useDevRideSeed } from '../../src/dev/useDevRideSeed';
import { describeRouteForReader, formatDistanceM, formatDurationS, placePoint } from '../../src/geo/geoFormat';
import { describeGeoProblem } from '../../src/geo/geoProblems';
import { goBackOr } from '../../src/navigation/goBack';
import { useSession } from '../../src/session/SessionProvider';
import { selectedFareQuote, useRideRequestStore } from '../../src/store/useRideRequestStore';
import { categoryDescription, categoryName, formatQuotePrice } from '../../src/utils/rideQuoteFormatting';

/**
 * P05 — Categoria e preço (`docs/fichas-de-tela/P05-categoria-e-orcamento.md`). Fluxo: P04 → aqui → P06.
 *
 * Fatia G6: tudo o que esta tela mostra de número vem da COTAÇÃO ASSINADA do contrato do M4 (`FareQuotePort`, via store):
 * quais categorias existem para o trajeto, o preço FECHADO de cada uma (D-06; por isso "Preço", não "Preço estimado") e
 * a rota (polilinha desenhada no mapa, distância e tempo). Nome e legenda vêm de `GET /v1/categories`. O "chega em N min"
 * saiu: o contrato do M4 não tem tempo até o embarque (é do despacho, M5).
 *
 * Erros, pelo catálogo `GEO_QUOTE_ERRORS` (`src/geo/geoProblems.ts`): fora da área e trajeto curto levam a trocar o
 * destino; rota/servidor indisponível e limite de tentativas, a tentar de novo; `503 fare_not_configured` é "ainda não
 * operamos" e leva ao início (NÃO "tente de novo"). Preço vencido no "Continuar": cota de novo, avisa "O preço foi
 * atualizado" e pede um segundo toque (ficha §5).
 */
export default function CategoryScreen() {
  useDevGeoParams('createQuotes'); // antes do seed: o cenário de erro precisa valer para a 1ª cotação
  useDevRideSeed();

  const { signOut } = useSession();
  const online = useNetworkStatus();
  const origin = useRideRequestStore((state) => state.origin);
  const destination = useRideRequestStore((state) => state.destination);
  const categoryId = useRideRequestStore((state) => state.categoryId);
  const setCategory = useRideRequestStore((state) => state.setCategory);
  const quoteStatus = useRideRequestStore((state) => state.quoteStatus);
  const fareQuotes = useRideRequestStore((state) => state.fareQuotes);
  const quoteRoute = useRideRequestStore((state) => state.quoteRoute);
  const quoteError = useRideRequestStore((state) => state.quoteError);
  const priceUpdated = useRideRequestStore((state) => state.priceUpdated);
  const categoryUnavailable = useRideRequestStore((state) => state.categoryUnavailable);
  const categoryInfo = useRideRequestStore((state) => state.categoryInfo);
  const refreshQuote = useRideRequestStore((state) => state.refreshQuote);
  const acknowledgePriceUpdate = useRideRequestStore((state) => state.acknowledgePriceUpdate);
  const paymentMethodId = useRideRequestStore((state) => state.paymentMethodId);
  const setPaymentMethod = useRideRequestStore((state) => state.setPaymentMethod);

  const [paymentPickerOpen, setPaymentPickerOpen] = useState(false);
  /** Quantas vezes "Continuar" foi tocado sem categoria: cada toque remonta o aviso, e o leitor de tela o anuncia de novo. */
  const [chooseNudges, setChooseNudges] = useState(0);

  // `AppShell padded={false}` (o mapa sangra até a borda): é o PAINEL quem aplica o respiro lateral, no mesmo corte
  // (< 375pt) que o `AppShell` usaria.
  const { width } = useWindowDimensions();
  const panelPadding = width < 375 ? theme.layout.screenPaddingCompact : theme.layout.screenPadding;

  const selectedQuote = selectedFareQuote({ fareQuotes, categoryId });
  const selectedPayment = MOCK_PAYMENT_METHODS.find((method) => method.id === paymentMethodId);
  const anyTestFare = fareQuotes.some((quote) => quote.isTestFare);
  // Sem categoria escolhida o "Continuar" NÃO desliga: tocar nele explica o que falta (o aviso é anunciado), em vez de um
  // botão morto sem motivo. Desliga só sem rede, cotando, sem cotação ou sem pagamento.
  const canContinue = online && quoteStatus === 'ready' && fareQuotes.length > 0 && selectedPayment !== undefined;
  const showChooseAlert = quoteStatus === 'ready' && !selectedQuote && (categoryUnavailable || chooseNudges > 0);
  const problem = quoteStatus === 'error' ? describeGeoProblem(quoteError ?? { kind: 'network', retryable: true }, 'quote') : undefined;

  const continueBlockedReason = !online
    ? 'sem conexão'
    : quoteStatus === 'loading'
      ? 'calculando o preço'
      : 'escolha a forma de pagamento';

  function handleChangeRoute() {
    goBackOr('/destino');
  }

  function handleProblemAction() {
    if (!problem) return;
    switch (problem.action) {
      case 'retry':
        refreshQuote();
        return;
      case 'requote':
        refreshQuote({ priceUpdated: true });
        return;
      case 'change_route':
        handleChangeRoute();
        return;
      case 'home':
        router.replace('/');
        return;
      case 'sign_in':
        void signOut();
        return;
    }
  }

  /**
   * Sem cotação para mostrar (erro, trajeto não atendido, sem trajeto), a ação que resolve vai para o RODAPÉ no lugar do
   * "Continuar" desabilitado: em 320×568 o painel rola, e a saída ("Voltar ao início", "Trocar destino", "Tentar de
   * novo") ficava abaixo da dobra (G-11), medido na captura da `fare_not_configured`.
   */
  const recovery: { readonly label: string; readonly onPress: () => void; readonly testID: string } | undefined = problem
    ? { label: problem.actionLabel, onPress: handleProblemAction, testID: 'category-problem-action' }
    : quoteStatus === 'idle'
      ? { label: 'Escolher destino', onPress: () => router.push('/destino'), testID: 'pick-destination-button' }
      : quoteStatus === 'ready' && fareQuotes.length === 0
        ? { label: 'Trocar destino', onPress: handleChangeRoute, testID: 'change-destination-button' }
        : undefined;

  function handleContinue() {
    if (!canContinue) return;
    if (!selectedQuote) {
      // NUNCA escolhe por ela (achado da Íris na G6): avisa de novo e espera a escolha.
      setChooseNudges((value) => value + 1);
      return;
    }
    // Regra do domínio (sem rede): preço vencido cota de novo e pede o segundo toque, com o valor novo à vista.
    if (isQuoteExpired(selectedQuote.expiresAt, Date.now())) {
      refreshQuote({ priceUpdated: true });
      return;
    }
    if (priceUpdated) acknowledgePriceUpdate();
    router.push('/confirmacao');
  }

  return (
    <AppShell
      padded={false}
      scroll
      footer={
        <FooterActions testID="category-footer">
          {recovery ? (
            <PrimaryButton label={recovery.label} onPress={recovery.onPress} testID={recovery.testID} />
          ) : (
            <PrimaryButton
              label="Continuar"
              icon={<ArrowRight size={20} color={theme.role.ctaText} strokeWidth={2.25} />}
              onPress={handleContinue}
              disabled={!canContinue}
              accessibilityLabel={canContinue ? 'Continuar' : `Continuar, indisponível: ${continueBlockedReason}`}
              testID="continue-to-confirmation-button"
            />
          )}
          {!online ? (
            <Text style={styles.footerNote} testID="category-offline-note">
              Sem conexão
            </Text>
          ) : null}
        </FooterActions>
      }
    >
      <View style={styles.content}>
        <RouteMapBanner
          originAddress={origin?.address ?? 'Origem não definida'}
          destinationAddress={destination?.address ?? 'Destino não definido'}
          originPoint={origin ? placePoint(origin) : undefined}
          destinationPoint={destination ? placePoint(destination) : undefined}
          polyline={quoteStatus === 'ready' ? quoteRoute?.polyline : undefined}
          routeDescription={quoteStatus === 'ready' && quoteRoute ? describeRouteForReader(quoteRoute.distanceM, quoteRoute.durationS) : undefined}
          onBack={handleChangeRoute}
          testID="category-map"
        />

        <View style={[styles.panel, { paddingHorizontal: panelPadding }]}>
          <View style={styles.handle} accessibilityElementsHidden importantForAccessibility="no" />
          <NetworkBanner testID="category-network-banner" />

          <View style={styles.titleBlock}>
            <SectionHeader title="Escolha uma categoria" mock={quoteStatus === 'ready' && anyTestFare} mockLabel="tarifa de teste" testID="category-section-header" />
            {quoteStatus === 'ready' && quoteRoute ? (
              <View style={styles.routeRow} testID="category-route-summary">
                <MapPinned size={14} color={theme.role.textSecondary} strokeWidth={2} />
                <Text style={styles.routeText}>
                  {formatDistanceM(quoteRoute.distanceM)} · cerca de {formatDurationS(quoteRoute.durationS)} de viagem
                </Text>
              </View>
            ) : null}
          </View>

          {showChooseAlert ? (
            <InlineAlert
              key={`escolha-${chooseNudges}`}
              tone="warning"
              message={categoryUnavailable ? 'Essa categoria não está mais disponível. Escolha outra.' : 'Escolha uma categoria para continuar.'}
              announce
              testID={categoryUnavailable ? 'category-unavailable' : 'category-choose-alert'}
            />
          ) : null}

          {priceUpdated && quoteStatus === 'ready' && !categoryUnavailable ? (
            <InlineAlert tone="info" title="O preço foi atualizado." message="Confira o valor novo antes de continuar." announce testID="category-price-updated" />
          ) : null}

          {/* Sem cotação para mostrar, o motivo vem num aviso COMPACTO (não no `EmptyState` de ícone grande): a 320×568 o
              texto do "ainda não operamos" ficava atrás do rodapé em repouso (achado da Íris na G6). A ação fica no rodapé. */}
          {quoteStatus === 'idle' ? (
            // Defensivo: na navegação real esta tela só é alcançada com origem e destino definidos.
            <InlineAlert
              tone="info"
              title="Defina seu trajeto"
              message="Escolha de onde sai e para onde vai para ver as opções de viagem."
              testID="category-idle-state"
            />
          ) : quoteStatus === 'loading' ? (
            <View style={styles.categoryColumn} testID="category-loading-state" accessibilityLabel="Calculando o preço">
              <LoadingSkeleton variant="block" height={66} lines={2} />
            </View>
          ) : problem ? (
            // A ação mora no rodapé (`recovery`), visível sem rolar. "Não operamos" não é falha: tom informativo.
            <InlineAlert
              tone={problem.action === 'home' ? 'info' : problem.action === 'retry' || problem.action === 'requote' ? 'danger' : 'warning'}
              title={problem.title}
              message={problem.description}
              announce
              testID={`category-problem-${problem.key}`}
            />
          ) : fareQuotes.length === 0 ? (
            <InlineAlert
              tone="warning"
              title="Ainda não atendemos este trajeto."
              message="Nenhuma categoria atende esta rota agora. Escolha outro destino."
              testID="category-empty-state"
            />
          ) : (
            <View style={styles.categoryColumn} accessibilityRole="radiogroup" accessibilityLabel="Categoria">
              {fareQuotes.map((quote) => {
                const visual = categoryVisual(quote.categorySlug);
                return (
                  <RideCategoryCard
                    key={quote.quoteId}
                    name={categoryName(quote.categorySlug, categoryInfo)}
                    icon={visual.icon}
                    {...(visual.vehicleVariant ? { vehicleVariant: visual.vehicleVariant } : {})}
                    detail={categoryDescription(quote.categorySlug, categoryInfo)}
                    priceLabel={formatQuotePrice(quote)}
                    priceDescription={quote.isTestFare ? 'preço de teste' : 'preço'}
                    selected={categoryId === quote.categorySlug}
                    onPress={() => setCategory(quote.categorySlug)}
                    testID={`ride-category-${quote.categorySlug}`}
                  />
                );
              })}
            </View>
          )}

          {/* Pagamento só quando há o que pagar: sem cotação, ele só empurrava o motivo para baixo do rodapé. */}
          {recovery ? null : (
            <View style={styles.paymentSection}>
              <ListRow
                icon={<CreditCard size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
                label="Pagamento"
                value={selectedPayment?.label ?? 'Escolher forma de pagamento'}
                onPress={() => setPaymentPickerOpen((prev) => !prev)}
                accessibilityLabel={`Pagamento: ${selectedPayment?.label ?? 'nenhuma forma escolhida'}`}
                testID="payment-row"
              />
              {paymentPickerOpen ? (
                <View style={styles.paymentList} accessibilityRole="radiogroup" accessibilityLabel="Forma de pagamento">
                  <MockBadge label="formas de pagamento fictícias" />
                  {MOCK_PAYMENT_METHODS.map((method) => (
                    <PaymentMethodOption
                      key={method.id}
                      label={method.label}
                      description={method.description}
                      selected={paymentMethodId === method.id}
                      onPress={() => {
                        setPaymentMethod(method.id);
                        setPaymentPickerOpen(false);
                      }}
                      testID={`payment-method-${method.id}`}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          )}
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  // `role.surface` chapado é a exceção prevista pela régua para "painel inferior" (padrão premium §4/§6), com
  // `elevation.3`. Sem `flex` (ficha §2: "o painel tem a altura do conteúdo") — quem cresce é o mapa.
  panel: {
    backgroundColor: theme.role.surface,
    borderTopLeftRadius: theme.radius.xxl,
    borderTopRightRadius: theme.radius.xxl,
    boxShadow: theme.elevation['3'],
    paddingTop: theme.spacing['3'],
    paddingBottom: theme.spacing['5'],
    gap: theme.spacing['4'],
  },
  handle: {
    alignSelf: 'center',
    width: theme.layout.sheetHandleWidth,
    height: theme.layout.sheetHandleHeight,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.role.borderControl,
    marginBottom: theme.spacing['1'],
  },
  titleBlock: { gap: theme.spacing['2'] },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['1'] },
  routeText: { flexShrink: 1, color: theme.role.textSecondary, ...textStyle('regular', 'small') },
  categoryColumn: { gap: theme.spacing['2'] },
  paymentSection: { gap: theme.spacing['2'] },
  paymentList: { gap: theme.spacing['2'], marginTop: theme.spacing['1'] },
  footerNote: { color: theme.role.textMuted, ...textStyle('regular', 'caption'), textAlign: 'center' },
});
