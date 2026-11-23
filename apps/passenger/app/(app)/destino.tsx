import { useEffect, useMemo, useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Map as MapIcon, MapPin, SearchX } from 'lucide-react-native';
import type { Place } from '@vuumbora/domain';
import {
  AppShell,
  EmptyState,
  ErrorState,
  FooterActions,
  ListRow,
  LoadingSkeleton,
  NetworkBanner,
  PrimaryButton,
  ScreenHeader,
  SectionHeader,
  theme,
  textStyle,
  useNetworkStatus,
} from '@vuumbora/ui';
import { PlaceRow } from '../../src/components/destination/PlaceRow';
import { RouteInputCard } from '../../src/components/destination/RouteInputCard';
import { UnavailableNoticeBanner } from '../../src/components/auth/UnavailableNoticeBanner';
import { MOCK_CURRENT_LOCATION, MOCK_SAVED_PLACES } from '../../src/data/mockPlaces';
import { placesClient } from '../../src/places/placesClient';
import { useRideRequestStore } from '../../src/store/useRideRequestStore';

type ActiveField = 'origin' | 'destination';
type SearchStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'offline';

const MAX_RECENT = 3;

function addRecent(recent: readonly Place[], place: Place): readonly Place[] {
  const withoutDuplicate = recent.filter((item) => item.address !== place.address);
  return [place, ...withoutDuplicate].slice(0, MAX_RECENT);
}

/**
 * P04 — Para onde vamos? (`docs/fichas-de-tela/P04-origem-e-destino.md`, onda 2 do padrão
 * premium). Busca de endereço via `placesClient` (`PlacesPort` mock, `src/places/placesClient.ts`
 * — ainda sem Mapbox real, D1 do plano dos apps continua aberto). Regra permanente do achado da
 * F10 (`docs/area-de-servico-natal.md`, seção "Decisão do Atlas"): o usuário sempre CONFIRMA o
 * endereço devolvido, nunca só a coordenada — por isso toda escolha mostra o endereço por
 * extenso antes de avançar, nunca fixa a corrida só por latitude/longitude.
 *
 * "Escolher no mapa" (ficha §2): sem adaptador de mapa (C-12, ainda não construído), o toque
 * mostra o aviso de indisponível (`UnavailableNoticeBanner`, G-19) em vez de navegar para uma
 * tela que não existe.
 *
 * "Permissão negada" (ficha §5): não implementado nesta fatia — não há integração de
 * geolocalização nenhuma no app ainda (sem `expo-location`), então não há permissão real para
 * negar. Fica "n/a" até essa integração existir.
 */
export default function DestinationScreen() {
  const storeOrigin = useRideRequestStore((state) => state.origin);
  const storeDestination = useRideRequestStore((state) => state.destination);
  const setOrigin = useRideRequestStore((state) => state.setOrigin);
  const setDestination = useRideRequestStore((state) => state.setDestination);

  const online = useNetworkStatus();

  const [originEditable, setOriginEditable] = useState(storeOrigin !== undefined && storeOrigin !== MOCK_CURRENT_LOCATION);
  const [originPlace, setOriginPlace] = useState<Place | undefined>(storeOrigin ?? MOCK_CURRENT_LOCATION);
  const [originQuery, setOriginQuery] = useState(originEditable ? (storeOrigin?.address ?? '') : '');

  const [destinationPlace, setDestinationPlace] = useState<Place | undefined>(storeDestination);
  const [destinationQuery, setDestinationQuery] = useState(storeDestination?.address ?? '');

  const [activeField, setActiveField] = useState<ActiveField>('destination');
  const [recentPlaces, setRecentPlaces] = useState<readonly Place[]>([]);
  const [mapNoticeVisible, setMapNoticeVisible] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const [search, setSearch] = useState<{ readonly status: SearchStatus; readonly results: readonly Place[] }>({
    status: 'idle',
    results: [],
  });

  const activeQuery = activeField === 'origin' ? (originEditable ? originQuery : '') : destinationQuery;
  const activePlace = activeField === 'origin' ? originPlace : destinationPlace;
  // Reabrir a tela com origem/destino JÁ escolhidos preenche o campo com o endereço — isso não
  // é "o usuário está digitando uma busca nova", é só mostrar o que já está selecionado. Sem essa
  // distinção, a seção virava "Resultados" (autobusca pelo próprio endereço) em vez de
  // "Lugares salvos" ao simplesmente reabrir a P04 (achado ao testar o fluxo de reabertura).
  const isUnmodifiedSelection = Boolean(activePlace) && activeQuery === activePlace?.address;

  // Native só: o web (react-native-web) não dispara keyboardDidShow/Hide — a `FooterActions`
  // fica sempre visível lá, o que é aceitável (não há teclado físico de tela cheia para cobrir).
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Debounce de 300ms (ficha §5, "carregando"): só busca depois da digitação parar.
  useEffect(() => {
    const trimmed = activeQuery.trim();
    if (!trimmed || isUnmodifiedSelection) {
      setSearch({ status: 'idle', results: [] });
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled) return;
      if (!online) {
        setSearch({ status: 'offline', results: [] });
        return;
      }
      setSearch({ status: 'loading', results: [] });
      const result = await placesClient.search(trimmed);
      if (cancelled) return;
      if (!result.ok) {
        setSearch({ status: 'error', results: [] });
        return;
      }
      setSearch({ status: result.data.length > 0 ? 'ready' : 'empty', results: result.data });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeQuery, online, isUnmodifiedSelection]);

  const showingSaved = activeQuery.trim().length === 0 || isUnmodifiedSelection;

  function handleChangeOriginQuery(text: string) {
    setOriginQuery(text);
    setOriginPlace(undefined);
  }

  function handleChangeDestinationQuery(text: string) {
    setDestinationQuery(text);
    setDestinationPlace(undefined);
  }

  function handlePressLockedOrigin() {
    setOriginEditable(true);
    setOriginQuery('');
    setOriginPlace(undefined);
    setActiveField('origin');
  }

  function handlePickPlace(place: Place) {
    setRecentPlaces((prev) => addRecent(prev, place));

    if (activeField === 'origin') {
      setOriginPlace(place);
      setOriginQuery(place.address);
      setOriginEditable(true);
      setActiveField('destination');
      return;
    }

    setDestinationPlace(place);
    setDestinationQuery(place.address);

    // Ficha §2: com a origem já resolvida (mesmo a padrão "Sua localização atual"), escolher o
    // destino avança direto — "Confirmar" só entra quando a origem foi editada por ÚLTIMO.
    // Onda 3 (PP-2): antes voltava para a Home (que mostrava a categoria); agora a categoria
    // é a P05, então o destino escolhido leva para lá — `router.push` (não `replace`) para o
    // "‹" do balão de origem na P05 poder voltar e reabrir esta tela para ajustar o trajeto.
    if (originPlace) {
      setOrigin(originPlace);
      setDestination(place);
      router.push('/categoria');
    }
  }

  function handleSwap() {
    const nextOriginPlace = destinationPlace;
    const nextOriginQuery = destinationQuery;
    const nextDestinationPlace = originEditable ? originPlace : undefined;
    const nextDestinationQuery = originEditable ? originQuery : '';

    setOriginPlace(nextOriginPlace);
    setOriginQuery(nextOriginQuery);
    setOriginEditable(true);
    setDestinationPlace(nextDestinationPlace);
    setDestinationQuery(nextDestinationQuery);
    setActiveField(nextDestinationPlace ? 'destination' : 'origin');
  }

  const canConfirm = Boolean(originPlace && destinationPlace);

  function handleConfirm() {
    if (!originPlace || !destinationPlace) return;
    setOrigin(originPlace);
    setDestination(destinationPlace);
    router.push('/categoria'); // onda 3 (PP-2): ver comentário em `handlePickPlace`.
  }

  const savedToShow = useMemo(
    () => MOCK_SAVED_PLACES.filter((place) => !recentPlaces.some((recent) => recent.address === place.address)),
    [recentPlaces],
  );

  return (
    <AppShell
      scroll
      glow
      footer={
        canConfirm && !keyboardVisible ? (
          <FooterActions testID="destination-footer">
            <PrimaryButton
              label="Confirmar"
              icon={<MapPin size={20} color={theme.role.ctaText} strokeWidth={2.25} />}
              onPress={handleConfirm}
              accessibilityLabel="Confirmar origem e destino"
              testID="confirm-destination-button"
            />
          </FooterActions>
        ) : undefined
      }
    >
      <View style={styles.content}>
        <ScreenHeader title="Para onde vamos?" onBack={() => router.back()} testID="destination-header" />
        <NetworkBanner testID="destination-network-banner" />

        <RouteInputCard
          testID="route-input-card"
          origin={{
            value: originEditable ? originQuery : MOCK_CURRENT_LOCATION.label,
            placeholder: 'De onde você vai sair?',
            onChangeText: handleChangeOriginQuery,
            onFocus: () => setActiveField('origin'),
            editable: originEditable,
            onPressLocked: handlePressLockedOrigin,
          }}
          destination={{
            value: destinationQuery,
            placeholder: 'Para onde você vai?',
            onChangeText: handleChangeDestinationQuery,
            onFocus: () => setActiveField('destination'),
          }}
          onSwap={handleSwap}
        />

        <View>
          <ListRow
            icon={<MapIcon size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
            label="Escolher no mapa"
            onPress={() => setMapNoticeVisible(true)}
            testID="choose-on-map-row"
          />
          {mapNoticeVisible ? (
            <View style={styles.mapNotice}>
              <UnavailableNoticeBanner
                message="Escolher no mapa ainda não está disponível. Por enquanto, busque pelo nome da rua ou do lugar."
                testID="choose-on-map-notice"
              />
            </View>
          ) : null}
        </View>

        {showingSaved ? (
          <>
            {recentPlaces.length > 0 ? (
              <View style={styles.listSection}>
                <SectionHeader title="Recentes" testID="recent-section-header" />
                {recentPlaces.map((place) => (
                  <PlaceRow key={`recent-${place.address}`} place={place} onPress={handlePickPlace} testID="recent-place-row" />
                ))}
              </View>
            ) : null}

            <View style={styles.listSection}>
              <SectionHeader title="Lugares salvos" mock mockLabel="endereços de exemplo" testID="saved-section-header" />
              {savedToShow.map((place) => (
                <PlaceRow key={place.label} place={place} onPress={handlePickPlace} testID={`saved-place-${place.label}`} />
              ))}
            </View>
          </>
        ) : (
          <View style={styles.listSection}>
            <SectionHeader title="Resultados" mock mockLabel="endereços de exemplo" testID="results-section-header" />

            {search.status === 'loading' ? (
              <LoadingSkeleton variant="block" height={56} lines={3} testID="destination-search-loading" />
            ) : search.status === 'offline' ? (
              <Text style={styles.offlineText} testID="destination-search-offline">
                Sem conexão para buscar endereços novos.
              </Text>
            ) : search.status === 'error' ? (
              <ErrorState
                title="Não conseguimos buscar agora"
                description="Tente de novo em instantes."
                onRetry={() => setSearch({ status: 'idle', results: [] })}
                testID="destination-search-error"
              />
            ) : search.status === 'empty' ? (
              <EmptyState
                title="Nenhum endereço encontrado"
                description="Tente outro nome de rua, bairro ou ponto de referência."
                icon={({ size, color }) => <SearchX size={size} color={color} strokeWidth={1.75} />}
                testID="destination-empty-state"
              />
            ) : (
              search.results.map((place) => <PlaceRow key={`${place.label}-${place.address}`} place={place} onPress={handlePickPlace} testID="search-result" />)
            )}
          </View>
        )}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  listSection: { gap: theme.spacing['2'] },
  mapNotice: { marginTop: theme.spacing['2'] },
  offlineText: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center', padding: theme.spacing['3'] },
});
