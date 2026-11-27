import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { BackHandler, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Car, MapPin } from 'lucide-react-native';
import {
  AppShell,
  FooterActions,
  InlineAlert,
  MockBadge,
  MoneyText,
  NetworkBanner,
  PrimaryButton,
  ScreenHeader,
  SecondaryButton,
  SurfaceRaised,
  tabularNums,
  textStyle,
  theme,
  tokens,
  useNetworkStatus,
  useSecondsUntil,
} from '@vuumbora/ui';
import { startNewOfferCycle } from '../../src/ride/driverRideClient';
import { OfferCountdown } from '../../src/components/ride/OfferCountdown';
import { formatPickupDistance, formatPickupEta, formatTripDistanceRange, formatTripDurationRange } from '../../src/utils/offerFormat';

const OFFER_TTL_S = 15;
const SHORT_WINDOW_HEIGHT = 640;
/** M06 §5 ("contador em zero"): sem resposta do servidor em 3 s depois de zerar, a tela fecha sozinha. */
const AUTO_EXPIRE_AFTER_ZERO_MS = 3000;
/** M06 §5: qualquer oferta revogada (tomada/expirada/cancelada) volta à M05 sozinha em 2 s. */
const REVOKED_AUTO_CLOSE_MS = 2000;

interface MockOffer {
  readonly pickupNeighborhood: string;
  readonly destinationNeighborhood: string;
  readonly pickupDistanceM: number;
  readonly pickupEtaS: number;
  readonly tripDistanceRange: { readonly min: number; readonly max: number };
  readonly tripDurationRange: { readonly min: number; readonly max: number };
  readonly estimatedPayoutCents: number;
}

const DEFAULT_OFFER: MockOffer = {
  pickupNeighborhood: 'Lagoa Nova',
  destinationNeighborhood: 'Tirol',
  pickupDistanceM: 1800,
  pickupEtaS: 360,
  tripDistanceRange: { min: 4000, max: 5000 },
  tripDurationRange: { min: 600, max: 900 },
  estimatedPayoutCents: 1890,
};

/** Pior caso de texto (ficha §5 "texto longo"): bairros compostos e valor de 4 dígitos. */
const LONG_TEXT_OFFER: MockOffer = {
  pickupNeighborhood: 'Parque das Nações, Parnamirim',
  destinationNeighborhood: 'Cidade da Esperança',
  pickupDistanceM: 2300,
  pickupEtaS: 420,
  tripDistanceRange: { min: 7000, max: 8000 },
  tripDurationRange: { min: 1200, max: 1500 },
  estimatedPayoutCents: 123456,
};

type DevState = 'aceitando' | 'tomada' | 'expirou' | 'cancelada' | 'zero' | 'erro-rede' | 'sem-rede' | 'texto-longo';

function isDevState(value: string | undefined): value is DevState {
  return (
    value === 'aceitando' ||
    value === 'tomada' ||
    value === 'expirou' ||
    value === 'cancelada' ||
    value === 'zero' ||
    value === 'erro-rede' ||
    value === 'sem-rede' ||
    value === 'texto-longo'
  );
}

const REVOKED_MESSAGE: Record<'taken' | 'expired' | 'cancelled', string> = {
  taken: 'Outro motorista aceitou antes.',
  expired: 'A oferta expirou.',
  cancelled: 'O passageiro cancelou o pedido.',
};

/**
 * M06 — Nova corrida (oferta em tela cheia), sobre `docs/fichas-de-tela/M06-nova-corrida.md`.
 * O `NewRideOfferCard` (órfão desde a onda 2, `[[project_m05_onda2_painel_motorista]]`) virou esta
 * tela de verdade — o componente antigo foi removido (layout vertical de 3 cartões, não as 2
 * colunas dele; `formatPickupDistance`/`formatPickupEta` migraram para `src/utils/offerFormat.ts`).
 *
 * Sem rede nova: nenhum `DriverOfferPort` real é chamado aqui (pendência §10 da ficha, para quando
 * o despacho existir) — os dados são MOCK, tipados pelo contrato real (`RideOffer`,
 * `@vuumbora/domain/driver`, acréscimo PP-12: `tripDistanceM`/`tripDurationS` em faixa). Aceitar e
 * recusar simulam a confirmação do servidor com um `setTimeout` (sem otimismo, `MOTORISTA.md`),
 * mesmo padrão do `handleToggleOnline` da M05.
 *
 * `?devEstado=` (`__DEV__`, removido do bundle de produção): força os estados que dependem do
 * servidor para a ferramenta de qualidade-tela fotografar sem esperar por um despacho real.
 */
export default function RideOfferScreen() {
  const { devEstado } = useLocalSearchParams<{ devEstado?: string }>();
  const forcedState = __DEV__ && isDevState(devEstado) ? devEstado : undefined;
  const { height: windowHeight } = useWindowDimensions();
  const compactHeight = windowHeight < SHORT_WINDOW_HEIGHT;
  const online = useNetworkStatus();

  // Uma oferta NOVA = um `tripId` NOVO no mock (`driverRideClient`) — síncrono no 1º render (não um
  // `useEffect`), para já valer antes de qualquer toque em "Aceitar". Sem isto, uma 2ª corrida na
  // MESMA sessão (voltar à M05 e receber outra oferta) reusava o `tripId` já `completed`/`in_progress`
  // da primeira, e `arrived`/`start` quebravam com erro silencioso — achado real da Íris.
  useState(startNewOfferCycle);

  const offerData = forcedState === 'texto-longo' ? LONG_TEXT_OFFER : DEFAULT_OFFER;
  const offline = forcedState === 'sem-rede' || !online;
  const forcedRevokedReason =
    forcedState === 'tomada' ? 'taken' : forcedState === 'expirou' ? 'expired' : forcedState === 'cancelada' ? 'cancelled' : undefined;

  // Instante fixo no MONTE da tela (nunca recalculado a cada render) — `expiresAt` é o que manda,
  // igual ao servidor de verdade (M06 §0: "o contador visual NÃO é fonte de verdade").
  const [expiresAt] = useState(() => new Date(Date.now() + (forcedState === 'zero' ? -1000 : OFFER_TTL_S * 1000)).toISOString());

  const [accepting, setAccepting] = useState(forcedState === 'aceitando');
  const [declining, setDeclining] = useState(false);
  const [acceptNetworkError, setAcceptNetworkError] = useState(forcedState === 'erro-rede');
  const [autoExpired, setAutoExpired] = useState(false);

  // M06 §5 ("contador local em zero"): o anel chega a 0 e os botões CONTINUAM ativos (o servidor é
  // quem decide, não o relógio local) — só depois de 3 s sem resposta nenhuma é que a tela fecha
  // sozinha com "A oferta expirou.". `useSecondsUntil` é a MESMA leitura que o `OfferCountdown` usa
  // (por instante, não por um `setInterval` próprio) — os dois nunca podem discordar sobre quando
  // zerou.
  const secondsLeft = useSecondsUntil(Date.parse(expiresAt));
  useEffect(() => {
    if (secondsLeft > 0 || autoExpired || forcedRevokedReason || accepting || declining) return undefined;
    const timer = setTimeout(() => setAutoExpired(true), AUTO_EXPIRE_AFTER_ZERO_MS);
    return () => clearTimeout(timer);
  }, [secondsLeft, autoExpired, forcedRevokedReason, accepting, declining]);

  const revokedReason = forcedRevokedReason ?? (autoExpired ? 'expired' : undefined);
  const navigatedAwayRef = useRef(false);

  function goBackToPanel() {
    if (navigatedAwayRef.current) return;
    navigatedAwayRef.current = true;
    router.replace('/');
  }

  // M06 §5: QUALQUER oferta revogada (tomada, expirada ou cancelada — forçada por `devEstado` ou
  // pelo contador de verdade) volta à M05 sozinha depois de 2 s. Antes disso não sobrava NENHUMA
  // saída: o rodapé sumia (`revokedReason ? undefined : <FooterActions>`) e a rota ficava presa em
  // `/oferta` — achado real da Íris com `m06-saida.mjs`.
  useEffect(() => {
    if (!revokedReason) return undefined;
    const timer = setTimeout(goBackToPanel, REVOKED_AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `goBackToPanel` só lê o ref, não precisa disparar o efeito de novo.
  }, [revokedReason]);

  // Voltar do Android NÃO fecha a oferta enquanto ela está ATIVA (D-34): recusar é uma decisão, não
  // um gesto acidental. Revogada, porém, o voltar passa a ser a MESMA saída do botão visível —
  // travar o back aqui também (como antes) deixava a tela sem NENHUMA saída por teclado/hardware.
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (revokedReason) goBackToPanel();
      return true;
    });
    return () => subscription.remove();
  }, [revokedReason]);

  function handleAccept() {
    if (forcedState || accepting || declining || offline || revokedReason) return;
    setAcceptNetworkError(false);
    setAccepting(true);
    setTimeout(() => {
      setAccepting(false);
      router.replace('/corrida');
    }, 900);
  }

  function handleDecline() {
    if (forcedState || accepting || declining) return;
    setDeclining(true);
    setTimeout(() => router.replace('/'), 500); // idempotente: fecha mesmo sem confirmação do servidor
  }

  return (
    <AppShell
      scroll
      footer={
        revokedReason ? (
          // Saída visível nos 2 s antes do fechamento automático (ver efeito acima) — sem isto, a
          // única forma de sair era esperar o `setTimeout`, sem nenhum controle na tela.
          <FooterActions elevated={false} testID="oferta-revogada-footer">
            <PrimaryButton label="Voltar ao painel" onPress={goBackToPanel} testID="back-to-panel-button" />
          </FooterActions>
        ) : (
          <FooterActions elevated={false} testID="oferta-footer">
            {acceptNetworkError ? <InlineAlert tone="warning" message="Sem conexão. Tentando de novo…" testID="oferta-erro-rede" /> : null}
            <PrimaryButton
              label="Aceitar corrida"
              onPress={handleAccept}
              loading={accepting}
              disabled={declining || offline}
              accessibilityLabel={offline ? 'Aceitar corrida, indisponível: sem conexão' : 'Aceitar corrida'}
              testID="accept-ride-button"
            />
            <SecondaryButton
              label="Recusar"
              onPress={handleDecline}
              loading={declining}
              disabled={accepting}
              size="prominent"
              testID="decline-ride-button"
            />
          </FooterActions>
        )
      }
      testID="oferta-screen"
    >
      <View style={styles.content}>
        <NetworkBanner testID="oferta-network-banner" />
        <ScreenHeader
          title="Nova corrida"
          rightSlot={<OfferCountdown expiresAt={expiresAt} totalSeconds={OFFER_TTL_S} testID="oferta-countdown" />}
          testID="oferta-header"
        />

        <View style={[styles.cardsBlock, revokedReason && styles.cardsFaded]}>
          <SurfaceRaised style={styles.card} testID="oferta-card-eta">
            <View style={styles.etaRow}>
              <View style={styles.vehicleIcon}>
                <Car size={24} color={theme.role.textSecondary} strokeWidth={1.75} />
              </View>
              <View style={styles.etaTextBlock}>
                <Text style={styles.etaTitle} numberOfLines={2}>
                  {formatPickupEta(offerData.pickupEtaS)} · {formatPickupDistance(offerData.pickupDistanceM)} até o embarque
                </Text>
                <Text style={styles.etaSubtitle}>VuumBora</Text>
              </View>
            </View>
          </SurfaceRaised>

          <SurfaceRaised style={styles.card} testID="oferta-card-rota">
            <View style={styles.routeRow}>
              <View style={[styles.dot, { backgroundColor: tokens.color.map.pickup }]} />
              <View style={styles.routeTextBlock}>
                <Text style={styles.routeLabel}>Embarque</Text>
                <Text style={styles.routeValue} numberOfLines={2}>
                  {offerData.pickupNeighborhood}
                </Text>
              </View>
            </View>
            <View style={styles.routeRow}>
              <MapPin size={16} color={tokens.color.map.destination} strokeWidth={2} />
              <View style={styles.routeTextBlock}>
                <Text style={styles.routeLabel}>Destino</Text>
                <Text style={styles.routeValue} numberOfLines={2}>
                  {offerData.destinationNeighborhood}
                </Text>
              </View>
            </View>
            <Text style={styles.tripRange} numberOfLines={1}>
              Viagem de {formatTripDistanceRange(offerData.tripDistanceRange)} · {formatTripDurationRange(offerData.tripDurationRange)}
            </Text>
          </SurfaceRaised>

          <SurfaceRaised style={[styles.card, styles.valueCard]} testID="oferta-card-valor">
            <MoneyText
              value={offerData.estimatedPayoutCents / 100}
              label="Ganho estimado"
              size={compactHeight ? 'heading' : 'display'}
              testID="oferta-valor"
            />
          </SurfaceRaised>
        </View>

        {revokedReason ? <InlineAlert tone="info" message={REVOKED_MESSAGE[revokedReason]} testID="oferta-revogada" /> : null}

        <MockBadge label="oferta de demonstração" testID="oferta-mock-badge" />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  cardsBlock: { gap: theme.spacing['2'] },
  cardsFaded: { opacity: 0.4 },
  card: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderTopColor: theme.role.edgeTop,
    borderColor: theme.role.edgeBottom,
    padding: theme.spacing['4'],
    gap: theme.spacing['2'],
  },
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'] },
  vehicleIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.role.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  etaTextBlock: { flex: 1, gap: 2 },
  etaTitle: { color: theme.role.textPrimary, ...textStyle('bold', 'title'), ...tabularNums },
  etaSubtitle: { color: theme.role.textSecondary, ...textStyle('regular', 'caption') },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing['2'] },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  routeTextBlock: { flex: 1, gap: 2 },
  routeLabel: { color: theme.role.textMuted, ...textStyle('medium', 'caption') },
  routeValue: { color: theme.role.textPrimary, ...textStyle('semibold', 'subtitle') },
  tripRange: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), marginTop: theme.spacing['1'] },
  valueCard: { alignItems: 'center' },
});
