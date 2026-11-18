import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Circle, MapPin } from 'lucide-react-native';
import type { Place } from '@vuumbora/domain';
import { AppShell, EmptyState, MockBadge, PrimaryButton, ScreenHeader, SearchInput, TextInput, theme, textStyle } from '@vuumbora/ui';
import { PlaceRow } from '../src/components/destination/PlaceRow';
import { MOCK_SAVED_PLACES, searchMockPlaces } from '../src/data/mockPlaces';
import { useRideRequestStore } from '../src/store/useRideRequestStore';

type ActiveField = 'origin' | 'destination';

/**
 * P04 — Para onde vamos? Sem mockup de referência (derivada do design system + da
 * composição da Home/P03). Busca e "lugares salvos" são 100% locais/fabricados — não
 * existe `PlacesPort` implementado ainda (pendência de contrato com a Vega).
 */
export default function DestinationScreen() {
  const storeOrigin = useRideRequestStore((state) => state.origin);
  const storeDestination = useRideRequestStore((state) => state.destination);
  const setOrigin = useRideRequestStore((state) => state.setOrigin);
  const setDestination = useRideRequestStore((state) => state.setDestination);

  const [originPlace, setOriginPlace] = useState<Place | undefined>(storeOrigin);
  const [originQuery, setOriginQuery] = useState(storeOrigin?.address ?? '');
  const [destinationPlace, setDestinationPlace] = useState<Place | undefined>(storeDestination);
  const [destinationQuery, setDestinationQuery] = useState(storeDestination?.address ?? '');
  const [activeField, setActiveField] = useState<ActiveField>('destination');

  const activeQuery = activeField === 'origin' ? originQuery : destinationQuery;
  const results = useMemo(() => (activeQuery.trim() ? searchMockPlaces(activeQuery) : []), [activeQuery]);
  const showingSaved = activeQuery.trim().length === 0;

  function handleChangeQuery(field: ActiveField, text: string) {
    if (field === 'origin') {
      setOriginQuery(text);
      setOriginPlace(undefined);
    } else {
      setDestinationQuery(text);
      setDestinationPlace(undefined);
    }
  }

  function handlePickPlace(place: Place) {
    if (activeField === 'origin') {
      setOriginPlace(place);
      setOriginQuery(place.address);
    } else {
      setDestinationPlace(place);
      setDestinationQuery(place.address);
    }
  }

  const canConfirm = Boolean(originPlace && destinationPlace);
  const missingLabel = !originPlace && !destinationPlace ? 'origem e destino' : !originPlace ? 'origem' : 'destino';

  function handleConfirm() {
    if (!originPlace || !destinationPlace) return;
    setOrigin(originPlace);
    setDestination(destinationPlace);
    router.back();
  }

  return (
    <AppShell scroll glow>
      <View style={styles.content}>
        <ScreenHeader title="Para onde vamos?" onBack={() => router.back()} testID="destination-header" />

        <TextInput
          label="Origem"
          value={originQuery}
          onChangeText={(text) => handleChangeQuery('origin', text)}
          onFocus={() => setActiveField('origin')}
          leftAccessory={<Circle size={14} color={theme.role.ctaBackground} fill={theme.role.ctaBackground} />}
          placeholder="De onde você vai sair?"
          accessibilityLabel="Origem"
          testID="origin-input"
        />

        <SearchInput
          label="Destino"
          value={destinationQuery}
          onChangeText={(text) => handleChangeQuery('destination', text)}
          onFocus={() => setActiveField('destination')}
          placeholder="Para onde você vai?"
          accessibilityLabel="Destino"
          testID="destination-input"
        />

        <View style={styles.listSection}>
          <View style={styles.listHeader}>
            <Text style={styles.listTitle}>{showingSaved ? 'Lugares salvos' : 'Resultados'}</Text>
            <MockBadge label="endereços fabricados" />
          </View>

          {showingSaved
            ? MOCK_SAVED_PLACES.map((place) => (
                <PlaceRow key={place.label} place={place} onPress={handlePickPlace} testID={`saved-place-${place.label}`} />
              ))
            : results.length > 0
              ? results.map((place) => (
                  <PlaceRow key={`${place.label}-${place.address}`} place={place} onPress={handlePickPlace} testID="search-result" />
                ))
              : (
                <EmptyState
                  title="Nenhum endereço encontrado"
                  description="Tente buscar por outro nome de rua, bairro ou ponto de referência."
                  testID="destination-empty-state"
                />
              )}
        </View>

        <PrimaryButton
          label="Confirmar"
          icon={<MapPin size={20} color={theme.role.ctaText} strokeWidth={2.25} />}
          onPress={handleConfirm}
          disabled={!canConfirm}
          accessibilityLabel="Confirmar origem e destino"
          testID="confirm-destination-button"
        />
        {!canConfirm ? (
          <Text style={styles.helperText} accessibilityRole="alert">
            Selecione {missingLabel} para continuar.
          </Text>
        ) : null}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  listSection: { gap: theme.spacing['2'] },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing['2'] },
  listTitle: { color: theme.role.textPrimary, ...textStyle('bold', 'body') },
  helperText: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
});
