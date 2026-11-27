import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Car, Circle, CreditCard, MapPin } from 'lucide-react-native';
import { canRequestRide } from '@vuumbora/domain/passenger';
import { AppShell, FooterActions, InlineAlert, MockBadge, MoneyText, PrimaryButton, ScreenHeader, SectionHeader, SurfaceRaised, theme, textStyle, tokens } from '@vuumbora/ui';
import { RouteSummaryRow } from '../../src/components/confirmation/RouteSummaryRow';
import { PaymentMethodOption } from '../../src/components/confirmation/PaymentMethodOption';
import { MOCK_PAYMENT_METHODS } from '../../src/data/mockPaymentMethods';
import { rideCategoryName } from '../../src/data/rideCategoryDisplay';
import { formatQuotePickupEta } from '../../src/utils/rideQuoteFormatting';
import { useDevRideSeed } from '../../src/dev/useDevRideSeed';
import { toRideDraft, useRideRequestStore } from '../../src/store/useRideRequestStore';

/**
 * P06 — Confirmação da corrida (`docs/fichas-de-tela/P06-confirmacao.md`, onda 3 do padrão
 * premium). A recomendação PP-3 do Apolo (P05+P06 num painel só, com "revisar" como 2º estado)
 * NÃO foi adotada nesta fatia — o Atlas manteve o fluxo linear em telas separadas (destino → P05
 * → P06, ver `(app)/categoria.tsx`), que é o que esta missão descreve; fica registrado para quem
 * quiser revisitar.
 *
 * Lacunas do protótipo corrigidas aqui (ficha §11): cartão chapado → `SurfaceRaised` (§11.1);
 * dois selos na linha do título → UM selo, embaixo do cartão (§11.2); carro/origem amarelos e
 * destino laranja → `map.pickup`/`map.destination`/ícone `textSecondary` (§11.3); preço em
 * `subtitle` → `heading` (N2, §11.4); aviso de falta em texto solto → `InlineAlert` (§11.5).
 *
 * F08b: a categoria/preço/tempo aqui vêm da MESMA cotação viva que a Home/P05 buscaram
 * (`quoteCategories`), nunca de um catálogo local — se a cotação não tem mais a categoria
 * escolhida (ex.: ficou muito tempo nesta tela e ela desligou), o botão "Solicitar" desliga.
 */
export default function ConfirmationScreen() {
  useDevRideSeed();

  const origin = useRideRequestStore((state) => state.origin);
  const destination = useRideRequestStore((state) => state.destination);
  const categoryId = useRideRequestStore((state) => state.categoryId);
  const paymentMethodId = useRideRequestStore((state) => state.paymentMethodId);
  const quoteCategories = useRideRequestStore((state) => state.quoteCategories);
  const setPaymentMethod = useRideRequestStore((state) => state.setPaymentMethod);
  const requestRide = useRideRequestStore((state) => state.requestRide);

  const [submitting, setSubmitting] = useState(false);

  const category = quoteCategories.find((c) => c.categoryId === categoryId);
  const canRequest = canRequestRide(toRideDraft({ origin, destination, categoryId, paymentMethodId })) && category !== undefined;

  const missing: string[] = [];
  if (!origin) missing.push('origem');
  if (!destination) missing.push('destino');
  if (!categoryId) missing.push('categoria');
  if (!paymentMethodId) missing.push('forma de pagamento');

  function handleRequest() {
    // Segundo toque durante o envio é ignorado (ficha §5, "Carregando ação") — aqui o envio é
    // síncrono (F08b: a transição de fase não espera o mock), mas a guarda cobre o caso real
    // (API de verdade, D3) sem precisar reescrever esta tela quando ela chegar.
    if (!canRequest || submitting) return;
    setSubmitting(true);
    requestRide();
    router.replace('/corrida');
  }

  return (
    <AppShell
      scroll
      glow
      footer={
        // G-11: o CTA principal precisa estar visível sem rolar em 320×568 (ou fixo no
        // rodapé) — o cartão + lista de pagamento sozinhos já passam da dobra nesse
        // tamanho, então o CTA fica fixo (igual à P04/P05), não solto no fim do conteúdo.
        <FooterActions testID="confirmation-footer">
          {!canRequest ? (
            <InlineAlert tone="warning" message={`Falta escolher: ${missing.join(', ')}.`} testID="confirmation-missing-alert" />
          ) : null}
          <PrimaryButton
            label="Solicitar corrida"
            icon={<Car size={20} color={theme.role.ctaText} strokeWidth={2.25} />}
            onPress={handleRequest}
            disabled={!canRequest}
            loading={submitting}
            accessibilityLabel={canRequest ? 'Solicitar corrida' : `Solicitar corrida, indisponível: falta escolher ${missing.join(', ')}`}
            testID="request-ride-button"
          />
          <Text style={styles.footerNote}>O valor final pode mudar se o trajeto mudar.</Text>
        </FooterActions>
      }
    >
      <View style={styles.content}>
        <ScreenHeader title="Confirme sua corrida" subtitle="Confira antes de solicitar" onBack={() => router.back()} testID="confirmation-header" />

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
          <View style={styles.divider} />
          {category ? (
            <View style={styles.categoryRow}>
              <Car size={24} color={theme.role.textSecondary} strokeWidth={1.75} />
              <View style={styles.categoryTextBlock}>
                <Text style={styles.categoryName} numberOfLines={1}>
                  {rideCategoryName(category.categoryId)} · chega em {formatQuotePickupEta(category)}
                </Text>
                {/* N2 da tela (ficha §3): rótulo pequeno em cima, número grande e tabular embaixo —
                    `MoneyText estimated` já junta os dois (C-10). */}
                <MoneyText value={category.estimate.total.amountCents / 100} estimated label="Preço estimado" size="heading" testID="confirmation-price" />
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
        <MockBadge label="corrida de demonstração" testID="confirmation-mock-badge" />

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
    // Borda iluminada de cima (direção de arte §4/§9 item 2) — `SurfaceRaised` dá o fundo
    // gradiente (lacuna §11.1: era `theme.role.surface` chapado).
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['3'],
  },
  divider: { height: 1, backgroundColor: theme.role.border },
  section: { gap: theme.spacing['2'] },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'] },
  categoryTextBlock: { flex: 1 },
  categoryName: { color: theme.role.textPrimary, ...textStyle('semibold', 'body') },
  paymentList: { gap: theme.spacing['2'] },
  helperText: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
  footerNote: { color: theme.role.textMuted, ...textStyle('regular', 'caption'), textAlign: 'center' },
});
