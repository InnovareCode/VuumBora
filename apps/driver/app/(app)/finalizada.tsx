import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, CheckCircle } from 'lucide-react-native';
import {
  AppShell,
  ErrorState,
  FooterActions,
  ListRow,
  LoadingSkeleton,
  MockBadge,
  MoneyText,
  NetworkBanner,
  PrimaryButton,
  SurfaceRaised,
  tabularNums,
  textStyle,
  theme,
  withAlpha,
} from '@vuumbora/ui';
import { formatDistanceKm, formatPickupEta } from '../../src/utils/offerFormat';

const MOCK_PICKUP_NEIGHBORHOOD = 'Lagoa Nova';
const MOCK_DESTINATION_NEIGHBORHOOD = 'Tirol';
const MOCK_LONG_PICKUP_NEIGHBORHOOD = 'Parque das Nações, Parnamirim';
const MOCK_LONG_DESTINATION_NEIGHBORHOOD = 'Cidade da Esperança';
const MOCK_ENDED_AT_LABEL = '10:36';
const MOCK_ESTIMATED_PAYOUT_CENTS = 1890;
const MOCK_LONG_ESTIMATED_PAYOUT_CENTS = 123456;
const MOCK_TRIP_DISTANCE_M = 4800;
const MOCK_TRIP_DURATION_S = 14 * 60;

type DevState = 'carregando' | 'valor-pendente' | 'erro' | 'sem-rede' | 'texto-longo';

function isDevState(value: string | undefined): value is DevState {
  return value === 'carregando' || value === 'valor-pendente' || value === 'erro' || value === 'sem-rede' || value === 'texto-longo';
}

/**
 * M10 — Corrida finalizada (resumo do motorista), à parte da rota `/corrida` (PP-10 só junta
 * M07/M08/M09) sobre `docs/fichas-de-tela/M10-corrida-finalizada.md`. Chega aqui por
 * `router.replace('/finalizada')` vindo do diálogo de finalizar da M09 (`corrida.tsx`).
 *
 * **"Ganho estimado" até o S5** (D-23/decisão 7 em aberto): nenhuma linha de "Taxa da
 * plataforma"/"Você recebe" — a ficha PROÍBE detalhar enquanto a decisão 7 não existir (D-38).
 * **Nenhum prazo de repasse** em texto nenhum (G-26). PP-13 (decidido): o motorista continua
 * ONLINE depois de finalizar — "Voltar ao painel" não chama nenhum endpoint para ficar offline.
 */
export default function RideCompletedScreen() {
  const { devEstado } = useLocalSearchParams<{ devEstado?: string }>();
  const forcedState = __DEV__ && isDevState(devEstado) ? devEstado : undefined;
  const [erroSimulado, setErroSimulado] = useState(forcedState === 'erro');

  const loading = forcedState === 'carregando';
  const erro = forcedState === 'erro' ? erroSimulado : false;
  const valuePending = forcedState === 'valor-pendente';
  const textoLongo = forcedState === 'texto-longo';

  const pickupNeighborhood = textoLongo ? MOCK_LONG_PICKUP_NEIGHBORHOOD : MOCK_PICKUP_NEIGHBORHOOD;
  const destinationNeighborhood = textoLongo ? MOCK_LONG_DESTINATION_NEIGHBORHOOD : MOCK_DESTINATION_NEIGHBORHOOD;
  const estimatedPayoutCents = textoLongo ? MOCK_LONG_ESTIMATED_PAYOUT_CENTS : MOCK_ESTIMATED_PAYOUT_CENTS;

  function handleReportProblem() {
    router.push({
      pathname: '/suporte',
      params: { tripCode: 'ABC123', tripRoute: `${pickupNeighborhood} → ${destinationNeighborhood}`, tripDate: MOCK_ENDED_AT_LABEL },
    });
  }

  return (
    <AppShell
      scroll
      glow
      footer={
        <FooterActions testID="finalizada-footer">
          {/* PP-13: continua online — nenhuma chamada aqui, só navegação. */}
          <PrimaryButton label="Voltar ao painel" onPress={() => router.replace('/')} testID="back-to-panel-button" />
        </FooterActions>
      }
      testID="finalizada-screen"
    >
      <View style={styles.content}>
        <NetworkBanner testID="finalizada-network-banner" />

        {loading ? (
          <View style={styles.headerLoading} testID="finalizada-carregando">
            <LoadingSkeleton variant="circle" height={56} />
            <LoadingSkeleton variant="line" width={160} />
          </View>
        ) : (
          <View style={styles.header}>
            <View style={styles.successBadge}>
              <CheckCircle size={32} color={theme.role.success} strokeWidth={1.75} />
            </View>
            <Text style={styles.title} accessibilityRole="header">
              Corrida finalizada
            </Text>
            <Text style={styles.subtitle} numberOfLines={2}>
              {pickupNeighborhood} → {destinationNeighborhood} · {MOCK_ENDED_AT_LABEL}
            </Text>
          </View>
        )}

        {erro ? (
          <ErrorState
            title="Não foi possível carregar o resumo agora."
            onRetry={() => setErroSimulado(false)}
            retryLabel="Tentar de novo"
            testID="finalizada-erro"
          />
        ) : !loading ? (
          <SurfaceRaised style={styles.valueCard} testID="finalizada-cartao-valor">
            {valuePending ? (
              <View style={styles.pendingBlock}>
                <LoadingSkeleton variant="line" width={120} />
                <Text style={styles.pendingText}>O valor aparece no histórico em instantes.</Text>
              </View>
            ) : (
              <MoneyText value={estimatedPayoutCents / 100} label="Ganho estimado" size="display" testID="finalizada-valor" />
            )}
            <View style={styles.valueDivider} />
            <Text style={styles.detailText} numberOfLines={2}>
              {formatDistanceKm(MOCK_TRIP_DISTANCE_M)} · {formatPickupEta(MOCK_TRIP_DURATION_S)} · VuumBora
            </Text>
          </SurfaceRaised>
        ) : null}

        {!loading && !erro ? <MockBadge label="valor de demonstração" testID="finalizada-mock-badge" /> : null}

        {!loading && !erro ? (
          <ListRow
            icon={<AlertTriangle size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Relatar um problema"
            onPress={handleReportProblem}
            testID="finalizada-relatar-problema"
          />
        ) : null}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['5'] },
  headerLoading: { alignItems: 'center', gap: theme.spacing['2'] },
  header: { alignItems: 'center', gap: theme.spacing['1'] },
  successBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withAlpha(theme.role.success, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing['1'],
  },
  title: { color: theme.role.textPrimary, ...textStyle('bold', 'title'), textAlign: 'center' },
  subtitle: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
  valueCard: {
    alignItems: 'center',
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['5'],
    gap: theme.spacing['3'],
  },
  pendingBlock: { alignItems: 'center', gap: theme.spacing['2'] },
  pendingText: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
  valueDivider: { height: 1, width: '100%', backgroundColor: theme.role.edgeBottom },
  detailText: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), ...tabularNums, textAlign: 'center' },
});
