import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Car, Circle, MapPin } from 'lucide-react-native';
import { canRequestRide } from '@vuumbora/domain/passenger';
import { AppShell, MockBadge, PrimaryButton, ScreenHeader, theme, textStyle, tabularNums } from '@vuumbora/ui';
import { RouteSummaryRow } from '../src/components/confirmation/RouteSummaryRow';
import { PaymentMethodOption } from '../src/components/confirmation/PaymentMethodOption';
import { MOCK_PAYMENT_METHODS } from '../src/data/mockPaymentMethods';
import { findMockRideCategory } from '../src/data/mockRideCategories';
import { toRideDraft, useRideRequestStore } from '../src/store/useRideRequestStore';

/**
 * P06 — Confirmação da corrida. Sem mockup de referência (derivada do design system +
 * da P03/Home). Preço é sempre "estimado" (regra de domínio) — nunca exibido como final.
 */
export default function ConfirmationScreen() {
  const origin = useRideRequestStore((state) => state.origin);
  const destination = useRideRequestStore((state) => state.destination);
  const categoryId = useRideRequestStore((state) => state.categoryId);
  const paymentMethodId = useRideRequestStore((state) => state.paymentMethodId);
  const setPaymentMethod = useRideRequestStore((state) => state.setPaymentMethod);
  const requestRide = useRideRequestStore((state) => state.requestRide);

  const category = findMockRideCategory(categoryId);
  const canRequest = canRequestRide(toRideDraft({ origin, destination, categoryId, paymentMethodId }));

  const missing: string[] = [];
  if (!origin) missing.push('origem');
  if (!destination) missing.push('destino');
  if (!categoryId) missing.push('categoria');
  if (!paymentMethodId) missing.push('forma de pagamento');

  function handleRequest() {
    if (!canRequest) return;
    requestRide();
    router.replace('/buscando');
  }

  return (
    <AppShell scroll>
      <View style={styles.content}>
        <ScreenHeader title="Confirmar corrida" subtitle="Confira antes de solicitar" onBack={() => router.back()} testID="confirmation-header" />

        <View style={styles.card}>
          <RouteSummaryRow
            icon={<Circle size={14} color={theme.role.ctaBackground} fill={theme.role.ctaBackground} />}
            label="Origem"
            value={origin?.address ?? 'Não definida'}
            testID="confirmation-origin"
          />
          <View style={styles.divider} />
          <RouteSummaryRow
            icon={<MapPin size={16} color={theme.role.warning} strokeWidth={2} fill={theme.role.warning} />}
            label="Destino"
            value={destination?.address ?? 'Não definido'}
            testID="confirmation-destination"
          />
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Categoria e preço</Text>
            <MockBadge label="preço estimado" />
          </View>
          {category ? (
            <View style={styles.categoryRow}>
              <Car size={24} color={theme.role.ctaBackground} strokeWidth={1.75} />
              <View style={styles.categoryTextBlock}>
                <Text style={styles.categoryName}>{category.name}</Text>
                <Text style={styles.categoryEta}>Chegada estimada em {category.etaLabel}</Text>
              </View>
              <Text style={styles.categoryPrice}>{category.priceLabel}</Text>
            </View>
          ) : (
            <Text style={styles.helperText}>Nenhuma categoria selecionada. Volte e escolha uma na tela inicial.</Text>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Forma de pagamento</Text>
            <MockBadge label="formas de pagamento fictícias" />
          </View>
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

        <PrimaryButton
          label="Solicitar"
          icon={<Car size={20} color={theme.role.ctaText} strokeWidth={2.25} />}
          onPress={handleRequest}
          disabled={!canRequest}
          accessibilityLabel="Solicitar corrida"
          testID="request-ride-button"
        />
        {!canRequest ? (
          <Text style={styles.helperText} accessibilityRole="alert">
            Falta definir: {missing.join(', ')}.
          </Text>
        ) : null}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  card: {
    backgroundColor: theme.role.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.role.border,
    padding: theme.spacing['4'],
    gap: theme.spacing['3'],
  },
  divider: { height: 1, backgroundColor: theme.role.border },
  section: { gap: theme.spacing['2'] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing['2'] },
  sectionTitle: { color: theme.role.textPrimary, ...textStyle('bold', 'body') },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'] },
  categoryTextBlock: { flex: 1 },
  categoryName: { color: theme.role.textPrimary, ...textStyle('semibold', 'body') },
  categoryEta: { color: theme.role.textMuted, ...textStyle('regular', 'small'), marginTop: 2 },
  categoryPrice: { color: theme.role.textPrimary, ...textStyle('bold', 'subtitle'), ...tabularNums },
  paymentList: { gap: theme.spacing['2'] },
  helperText: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
});
