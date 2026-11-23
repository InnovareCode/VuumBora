import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { ArrowRight, CreditCard } from 'lucide-react-native';
import {
  AppShell,
  EmptyState,
  ErrorState,
  FooterActions,
  ListRow,
  LoadingSkeleton,
  MockBadge,
  NetworkBanner,
  PrimaryButton,
  SectionHeader,
  theme,
} from '@vuumbora/ui';
import { RouteMapBanner } from '../../src/components/categoria/RouteMapBanner';
import { RideCategoryCard } from '../../src/components/categoria/RideCategoryCard';
import { categoryVisual } from '../../src/components/categoria/categoryVisuals';
import { PaymentMethodOption } from '../../src/components/confirmation/PaymentMethodOption';
import { MOCK_PAYMENT_METHODS } from '../../src/data/mockPaymentMethods';
import { rideCategoryName } from '../../src/data/rideCategoryDisplay';
import { formatQuotePickupEta, formatQuotePrice } from '../../src/utils/rideQuoteFormatting';
import { useDevRideSeed } from '../../src/dev/useDevRideSeed';
import { useRideRequestStore } from '../../src/store/useRideRequestStore';

/**
 * P05 — Categoria e orçamento (`docs/fichas-de-tela/P05-categoria-e-orcamento.md`, onda 3 do
 * padrão premium). PP-2 (decidido): categoria e "Solicitar corrida" SAEM da Home (P03) — o
 * fluxo passa a ser destino (P04) → categoria (aqui) → confirmação (P06). A Home e os atalhos
 * Casa/Trabalho/Favoritos chamam `setDestination` (que já dispara a cotação) e navegam para
 * cá — ver `(app)/index.tsx`.
 *
 * F08b/onda 2 preservados sem alteração: a lista de categorias vem SÓ da cotação viva
 * (`quoteCategories`), nunca de um catálogo fixo — Motorista mulher/Entrega/Pet continuam fora
 * do DOM enquanto D-08/D-09 não ligam; `requestedCategory` do recibo é escrito só no
 * `requestRide` (P06), não aqui.
 */
export default function CategoryScreen() {
  useDevRideSeed();

  const origin = useRideRequestStore((state) => state.origin);
  const destination = useRideRequestStore((state) => state.destination);
  const categoryId = useRideRequestStore((state) => state.categoryId);
  const setCategory = useRideRequestStore((state) => state.setCategory);
  const quoteStatus = useRideRequestStore((state) => state.quoteStatus);
  const quoteCategories = useRideRequestStore((state) => state.quoteCategories);
  const refreshQuote = useRideRequestStore((state) => state.refreshQuote);
  const paymentMethodId = useRideRequestStore((state) => state.paymentMethodId);
  const setPaymentMethod = useRideRequestStore((state) => state.setPaymentMethod);

  const [paymentPickerOpen, setPaymentPickerOpen] = useState(false);

  // `AppShell padded={false}` (ficha §4: "sem glow, tem mapa") não dá o respiro lateral de
  // `layout.screenPadding`/`screenPaddingCompact` (§3) — como o mapa sangra até a borda mesmo,
  // é o PAINEL (não o `AppShell`) quem aplica o respiro ao próprio conteúdo, no mesmo corte
  // (< 375pt) que o `AppShell` usaria.
  const { width } = useWindowDimensions();
  const panelPadding = width < 375 ? theme.layout.screenPaddingCompact : theme.layout.screenPadding;

  const selectedPayment = MOCK_PAYMENT_METHODS.find((method) => method.id === paymentMethodId);
  const canContinue = Boolean(categoryId && paymentMethodId);

  function handleBack() {
    router.back();
  }

  function handleContinue() {
    if (!canContinue) return;
    router.push('/confirmacao');
  }

  return (
    <AppShell
      padded={false}
      scroll
      footer={
        <FooterActions testID="category-footer">
          <PrimaryButton
            label="Continuar"
            icon={<ArrowRight size={20} color={theme.role.ctaText} strokeWidth={2.25} />}
            onPress={handleContinue}
            disabled={!canContinue}
            accessibilityLabel={canContinue ? 'Continuar' : 'Continuar, indisponível: escolha uma categoria'}
            testID="continue-to-confirmation-button"
          />
        </FooterActions>
      }
    >
      <View style={styles.content}>
        <RouteMapBanner
          originAddress={origin?.address ?? 'Sua localização atual'}
          destinationAddress={destination?.address ?? 'Para onde você vai?'}
          onBack={handleBack}
          testID="category-map"
        />

        <View style={[styles.panel, { paddingHorizontal: panelPadding }]}>
          <View style={styles.handle} accessibilityElementsHidden importantForAccessibility="no" />
          <NetworkBanner testID="category-network-banner" />

          <SectionHeader
            title="Escolha uma categoria"
            mock={quoteStatus === 'ready' && quoteCategories.length > 0}
            mockLabel="preço estimado de demonstração"
            testID="category-section-header"
          />

          {quoteStatus === 'idle' ? (
            // Defensivo: na navegação real esta tela só é alcançada com destino já definido
            // (Home/P04 chamam `setDestination` antes de navegar para aqui) — "idle" não é um
            // estado alcançável pela ficha, mas evita um painel vazio sem explicação se algo
            // chegar aqui sem destino (ex.: navegação direta por link).
            <EmptyState
              title="Defina seu destino"
              description="Escolha para onde você vai para ver as opções de viagem disponíveis."
              action={<PrimaryButton label="Escolher destino" onPress={() => router.push('/destino')} testID="pick-destination-button" />}
              testID="category-idle-state"
            />
          ) : quoteStatus === 'loading' ? (
            <View style={styles.categoryColumn} testID="category-loading-state">
              <LoadingSkeleton variant="block" height={66} lines={2} />
            </View>
          ) : quoteStatus === 'error' ? (
            <ErrorState
              title="Não conseguimos calcular o preço agora"
              description="Tente de novo em instantes."
              onRetry={refreshQuote}
              testID="category-error-state"
            />
          ) : quoteStatus === 'ready' && quoteCategories.length === 0 ? (
            <EmptyState
              title="Ainda não atendemos este trajeto"
              description="Escolha outro endereço de destino para ver opções disponíveis."
              action={<PrimaryButton label="Trocar destino" onPress={() => router.push('/destino')} testID="change-destination-button" />}
              testID="category-empty-state"
            />
          ) : (
            <View style={styles.categoryColumn} accessibilityRole="radiogroup">
              {quoteCategories.map((category) => {
                const visual = categoryVisual(category.categoryId);
                return (
                  <RideCategoryCard
                    key={category.categoryId}
                    name={rideCategoryName(category.categoryId)}
                    icon={visual.icon}
                    {...(visual.vehicleVariant ? { vehicleVariant: visual.vehicleVariant } : {})}
                    etaLabel={formatQuotePickupEta(category)}
                    priceLabel={formatQuotePrice(category)}
                    selected={categoryId === category.categoryId}
                    onPress={() => setCategory(category.categoryId)}
                    testID={`ride-category-${category.categoryId}`}
                  />
                );
              })}
            </View>
          )}

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
              <View style={styles.paymentList}>
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
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  // `role.surface` chapado é a exceção prevista pela própria régua para "painel inferior"
  // (`docs/padrao-premium-telas.md` §4/§6: "painel inferior e barra de abas, com elevation.3")
  // — diferente dos CARDS por dentro dele (`RideCategoryCard`/`PaymentMethodOption`), que usam
  // `SurfaceRaised`. `boxShadow` separa o painel do mapa por cima (G-02 não se aplica aqui).
  // Sem `flex` (ficha §2: "o painel tem a altura do conteúdo") — quem cresce para ocupar a
  // sobra vertical é o mapa (`RouteMapBanner`, `flex:1`), não o painel.
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
  categoryColumn: { gap: theme.spacing['2'] },
  paymentSection: { gap: theme.spacing['2'] },
  paymentList: { gap: theme.spacing['2'], marginTop: theme.spacing['1'] },
});
