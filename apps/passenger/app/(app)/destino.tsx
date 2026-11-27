import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, StyleSheet, Text, TextInput as RNTextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Map as MapIcon, MapPin, SearchX } from 'lucide-react-native';
import type { Place } from '@vuumbora/domain';
import type { GeoSearchResult, LatLng } from '@vuumbora/api-client/passenger';
import {
  AppShell,
  EmptyState,
  FooterActions,
  InlineAlert,
  LinkButton,
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
import { PinPicker } from '../../src/components/destination/PinPicker';
import { PlaceRow } from '../../src/components/destination/PlaceRow';
import { RouteInputCard } from '../../src/components/destination/RouteInputCard';
import { MOCK_SAVED_PLACES } from '../../src/data/mockPlaces';
import { SEARCH_MAX_LENGTH, useAddressSearch } from '../../src/destination/useAddressSearch';
import { useDevGeoParams } from '../../src/dev/devGeo';
import { CURRENT_LOCATION_LABEL, placeFromSearchResult, placePoint } from '../../src/geo/geoFormat';
import { describeGeoProblem } from '../../src/geo/geoProblems';
import { isLocationPending, useCurrentLocationPlace, useLocationStore } from '../../src/location/useLocationStore';
import { useSession } from '../../src/session/SessionProvider';
import { useRideRequestStore } from '../../src/store/useRideRequestStore';

type ActiveField = 'origin' | 'destination';
type OriginMode = 'current' | 'custom';

interface PinRequest {
  readonly field: ActiveField;
  readonly initialPoint?: LatLng | undefined;
  readonly startPlace?: Place | undefined;
}

const MAX_RECENT = 3;

function addRecent(recent: readonly Place[], place: Place): readonly Place[] {
  const withoutDuplicate = recent.filter((item) => item.address !== place.address);
  return [place, ...withoutDuplicate].slice(0, MAX_RECENT);
}

/**
 * P04 — Para onde vamos? (`docs/fichas-de-tela/P04-origem-e-destino.md`).
 *
 * Fatia G6 (N6 do `docs/plano-m3-m4.md`):
 * - a busca é PELO SERVIDOR (`useAddressSearch` → `geoPort.search`, pontos próprios primeiro);
 * - **todo ponto da busca passa pelo pino** (`PinPicker`): o servidor diz o endereço do ponto (`reverse`) e só esse
 *   endereço confirmado vira origem/destino. Isso muda a regra da ficha §2 ("tocar num resultado vai direto para a P05"):
 *   agora vai para a confirmação do pino, e dela para a P05. Lugares salvos e recentes já foram confirmados e seguem direto;
 * - "Escolher no mapa" existe SEMPRE (inclusive sem resultado e com erro de busca): é o caminho quando a busca não acha;
 * - a origem padrão é a POSIÇÃO DO APARELHO (`src/location`). Sem posição (recusa, erro, aparelho sem o módulo), a origem
 *   abre como campo vazio com o foco nela (ficha §5, "Permissão negada").
 */
export default function DestinationScreen() {
  const { devPino, devBusca } = useLocalSearchParams<{ devPino?: string; devBusca?: string }>();
  useDevGeoParams(devPino ? 'reverse' : 'search');

  const { signOut } = useSession();
  const storeOrigin = useRideRequestStore((state) => state.origin);
  const storeDestination = useRideRequestStore((state) => state.destination);
  const setRoute = useRideRequestStore((state) => state.setRoute);

  const locationStatus = useLocationStore((state) => state.status);
  const position = useLocationStore((state) => state.position);
  const ensureLocationStarted = useLocationStore((state) => state.ensureStarted);
  const currentPlace = useCurrentLocationPlace();

  const online = useNetworkStatus();
  const originInputRef = useRef<ComponentRef<typeof RNTextInput>>(null);

  const storeOriginIsCustom = storeOrigin !== undefined && storeOrigin.label !== CURRENT_LOCATION_LABEL;
  const [originMode, setOriginMode] = useState<OriginMode>(() =>
    storeOriginIsCustom || !(locationStatus === 'located' || isLocationPending(locationStatus)) ? 'custom' : 'current',
  );
  const [customOrigin, setCustomOrigin] = useState<Place | undefined>(storeOriginIsCustom ? storeOrigin : undefined);
  const [originQuery, setOriginQuery] = useState(storeOriginIsCustom ? (storeOrigin?.address ?? '') : '');

  const [destinationPlace, setDestinationPlace] = useState<Place | undefined>(storeDestination);
  const [destinationQuery, setDestinationQuery] = useState(() => (__DEV__ && typeof devBusca === 'string' ? devBusca.slice(0, SEARCH_MAX_LENGTH) : (storeDestination?.address ?? '')));

  const [activeField, setActiveField] = useState<ActiveField>('destination');
  const [recentPlaces, setRecentPlaces] = useState<readonly Place[]>([]);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [pin, setPin] = useState<PinRequest | null>(null);

  const originPlace = originMode === 'current' ? currentPlace : customOrigin;

  useEffect(() => {
    ensureLocationStarted();
  }, [ensureLocationStarted]);

  // A posição não veio (recusa, erro, sem módulo, pré-permissão ainda não respondida): a origem vira campo vazio com o
  // foco nela (ficha §5), em vez de ficar presa em "procurando". Vale também ao ABRIR a tela já sem posição.
  const originNeedsTyping = originMode === 'custom' && customOrigin === undefined && originQuery === '';
  useEffect(() => {
    if (originMode === 'current') {
      if (locationStatus === 'located' || isLocationPending(locationStatus)) return;
      setOriginMode('custom');
    } else if (!originNeedsTyping) {
      return;
    }
    setActiveField('origin');
    requestAnimationFrame(() => originInputRef.current?.focus());
    // Só quando a posição muda de estado (ou ao montar): não roubar o foco de quem já está digitando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationStatus]);

  // Só `__DEV__` (`?devPino=destino|origem`): abre direto no pino, para a captura de tela — uma vez, depois de a
  // leitura da posição terminar (o pino parte da posição, se houver).
  const devPinOpened = useRef(false);
  useEffect(() => {
    if (!__DEV__ || devPinOpened.current || (devPino !== 'destino' && devPino !== 'origem') || isLocationPending(locationStatus)) return;
    devPinOpened.current = true;
    setPin({ field: devPino === 'origem' ? 'origin' : 'destination', initialPoint: position ? { lat: position.lat, lng: position.lng } : undefined });
  }, [devPino, locationStatus, position]);

  // Native só: o web (react-native-web) não dispara keyboardDidShow/Hide.
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const activeQuery = activeField === 'origin' ? (originMode === 'custom' ? originQuery : '') : destinationQuery;
  const activePlace = activeField === 'origin' ? originPlace : destinationPlace;
  // Reabrir a tela com o lugar JÁ escolhido preenche o campo com o endereço — isso não é uma busca nova.
  const isUnmodifiedSelection = Boolean(activePlace) && activeQuery === activePlace?.address;

  const search = useAddressSearch(activeQuery, {
    enabled: !isUnmodifiedSelection,
    online,
    ...(position ? { nearLat: position.lat, nearLng: position.lng } : {}),
  });
  const showingSaved = activeQuery.trim().length === 0 || isUnmodifiedSelection;
  const searchProblem = search.error ? describeGeoProblem(search.error, 'search') : undefined;

  function handleChangeOriginQuery(text: string) {
    setOriginQuery(text);
    setCustomOrigin(undefined);
  }

  function handleChangeDestinationQuery(text: string) {
    setDestinationQuery(text);
    setDestinationPlace(undefined);
  }

  function handlePressLockedOrigin() {
    setOriginMode('custom');
    setOriginQuery('');
    setCustomOrigin(undefined);
    setActiveField('origin');
  }

  /** Lugar já confirmado (salvo, recente ou saído do pino) no campo ativo. */
  const applyConfirmedPlace = useCallback(
    (field: ActiveField, place: Place) => {
      setRecentPlaces((prev) => addRecent(prev, place));
      if (field === 'origin') {
        setOriginMode('custom');
        setCustomOrigin(place);
        setOriginQuery(place.address);
        setActiveField('destination');
        // Origem editada por último: segue pelo "Confirmar" (ficha §2), não direto.
        return;
      }
      setDestinationPlace(place);
      setDestinationQuery(place.address);
      // Ficha §2: com a origem já resolvida, escolher o destino segue direto para a P05 (`push`: o balão de origem da
      // P05 volta para cá).
      if (originPlace) {
        setRoute(originPlace, place);
        router.push('/categoria');
      }
    },
    [originPlace, setRoute],
  );

  function handlePickSaved(place: Place) {
    applyConfirmedPlace(activeField, place);
  }

  function handlePickResult(result: GeoSearchResult) {
    Keyboard.dismiss();
    setPin({ field: activeField, initialPoint: { lat: result.lat, lng: result.lng }, startPlace: placeFromSearchResult(result) });
  }

  function handleChooseOnMap() {
    Keyboard.dismiss();
    const fromField = activePlace ? placePoint(activePlace) : undefined;
    const fromDevice = position ? { lat: position.lat, lng: position.lng } : undefined;
    setPin({ field: activeField, initialPoint: fromField ?? fromDevice });
  }

  function handleSwap() {
    const nextOrigin = destinationPlace;
    const nextOriginQuery = destinationQuery;
    const nextDestination = originPlace;
    setOriginMode('custom');
    setCustomOrigin(nextOrigin);
    setOriginQuery(nextOriginQuery);
    setDestinationPlace(nextDestination);
    setDestinationQuery(nextDestination?.address ?? '');
    setActiveField(nextDestination ? 'destination' : 'origin');
  }

  function handleSearchProblemAction() {
    if (!searchProblem) return;
    if (searchProblem.action === 'sign_in') void signOut();
    else search.retry();
  }

  const canConfirm = Boolean(originPlace && destinationPlace);

  function handleConfirm() {
    if (!originPlace || !destinationPlace) return;
    setRoute(originPlace, destinationPlace);
    router.push('/categoria');
  }

  const handlePinConfirm = useCallback(
    (place: Place) => {
      const field = pin?.field ?? 'destination';
      setPin(null);
      applyConfirmedPlace(field, place);
    },
    [pin, applyConfirmedPlace],
  );
  const handlePinCancel = useCallback(() => setPin(null), []);

  const savedToShow = useMemo(
    () => MOCK_SAVED_PLACES.filter((place) => !recentPlaces.some((recent) => recent.address === place.address)),
    [recentPlaces],
  );

  if (pin) {
    return (
      <PinPicker
        field={pin.field}
        initialPoint={pin.initialPoint}
        startPlace={pin.startPlace}
        onConfirm={handlePinConfirm}
        onCancel={handlePinCancel}
        onSignIn={() => void signOut()}
      />
    );
  }

  const lockedOriginText = currentPlace ? CURRENT_LOCATION_LABEL : 'Procurando sua localização…';

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
            value: originMode === 'custom' ? originQuery : lockedOriginText,
            placeholder: 'De onde você vai sair?',
            onChangeText: handleChangeOriginQuery,
            onFocus: () => setActiveField('origin'),
            editable: originMode === 'custom',
            onPressLocked: handlePressLockedOrigin,
            inputRef: originInputRef,
            maxLength: SEARCH_MAX_LENGTH,
          }}
          destination={{
            value: destinationQuery,
            placeholder: 'Para onde você vai?',
            onChangeText: handleChangeDestinationQuery,
            onFocus: () => setActiveField('destination'),
            maxLength: SEARCH_MAX_LENGTH,
          }}
          onSwap={handleSwap}
        />

        {/* N6: o pino está SEMPRE disponível, inclusive quando a busca não acha ou falha. */}
        <ListRow
          icon={<MapIcon size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
          label="Escolher no mapa"
          onPress={handleChooseOnMap}
          accessibilityLabel={`Escolher ${activeField === 'origin' ? 'a origem' : 'o destino'} no mapa`}
          testID="choose-on-map-row"
        />

        {showingSaved ? null : (
          <View style={styles.listSection}>
            <SectionHeader title="Resultados" mock={search.fromMock} mockLabel="endereços de exemplo" testID="results-section-header" />

            {search.status === 'loading' || search.status === 'idle' ? (
              <LoadingSkeleton variant="block" height={56} lines={3} testID="destination-search-loading" />
            ) : search.status === 'offline' ? (
              <Text style={styles.supportText} testID="destination-search-offline">
                Sem conexão para buscar endereços novos.
              </Text>
            ) : search.status === 'error' && searchProblem ? (
              <View style={styles.problem} testID="destination-search-error">
                <InlineAlert tone="danger" title={searchProblem.title} message={searchProblem.description} testID={`destination-search-problem-${searchProblem.key}`} />
                <LinkButton label={searchProblem.actionLabel} onPress={handleSearchProblemAction} role="button" align="flex-start" testID="destination-search-problem-action" />
              </View>
            ) : search.status === 'empty' ? (
              <EmptyState
                title="Nenhum endereço encontrado"
                description="Tente outro nome de rua, bairro ou ponto de referência, ou marque o ponto no mapa."
                icon={({ size, color }) => <SearchX size={size} color={color} strokeWidth={1.75} />}
                action={<LinkButton label="Escolher no mapa" onPress={handleChooseOnMap} role="button" align="center" testID="empty-choose-on-map" />}
                testID="destination-empty-state"
              />
            ) : (
              <>
                <Text style={styles.supportText} accessibilityLiveRegion="polite" testID="destination-results-count">
                  {search.results.length === 1 ? '1 resultado' : `${search.results.length} resultados`}
                </Text>
                {searchProblem ? (
                  <View style={styles.problem}>
                    <InlineAlert tone="warning" title="Alguns resultados podem estar faltando." message={searchProblem.title} testID={`destination-search-partial-${searchProblem.key}`} />
                    <LinkButton label={searchProblem.actionLabel} onPress={handleSearchProblemAction} role="button" align="flex-start" testID="destination-search-partial-action" />
                  </View>
                ) : null}
                {search.results.map((result) => (
                  <ListRow
                    key={result.id}
                    icon={<MapPin size={20} color={theme.role.textSecondary} strokeWidth={1.75} />}
                    label={result.label}
                    value={result.sublabel}
                    valueLines={3}
                    onPress={() => handlePickResult(result)}
                    accessibilityLabel={`${result.label}, ${result.sublabel}. Tocar para conferir no mapa e escolher como ${activeField === 'origin' ? 'origem' : 'destino'}`}
                    testID={`search-result-${result.id}`}
                  />
                ))}
              </>
            )}
          </View>
        )}

        {/* Ficha §5: com a busca vazia, ou com erro de busca, os lugares salvos e recentes continuam. */}
        {showingSaved || search.status === 'error' || search.status === 'offline' ? (
          <>
            {recentPlaces.length > 0 ? (
              <View style={styles.listSection}>
                <SectionHeader title="Recentes" testID="recent-section-header" />
                {recentPlaces.map((place) => (
                  <PlaceRow key={`recent-${place.address}`} place={place} onPress={handlePickSaved} testID="recent-place-row" />
                ))}
              </View>
            ) : null}

            <View style={styles.listSection}>
              <SectionHeader title="Lugares salvos" mock mockLabel="endereços de exemplo" testID="saved-section-header" />
              {savedToShow.map((place) => (
                <PlaceRow key={place.label} place={place} onPress={handlePickSaved} testID={`saved-place-${place.label}`} />
              ))}
            </View>
          </>
        ) : null}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  listSection: { gap: theme.spacing['2'] },
  problem: { gap: theme.spacing['1'] },
  supportText: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), padding: theme.spacing['1'] },
});
