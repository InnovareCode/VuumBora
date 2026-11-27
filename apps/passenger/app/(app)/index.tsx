import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Briefcase, Home as HomeIcon, Star } from 'lucide-react-native';
import type { Place } from '@vuumbora/domain';
import { AppShell, MockBadge, NetworkBanner, theme } from '@vuumbora/ui';
import { HomeHeader } from '../../src/components/home/HomeHeader';
import { HomeMenuSheet } from '../../src/components/home/HomeMenuSheet';
import { GreetingRow } from '../../src/components/home/GreetingRow';
import { HomeMapPreview } from '../../src/components/home/HomeMapPreview';
import { DestinationSearchBar } from '../../src/components/home/DestinationSearchBar';
import { QuickAccessGrid, type QuickAccessItem } from '../../src/components/home/QuickAccessGrid';
import { MOCK_SAVED_PLACES } from '../../src/data/mockPlaces';
import { useDevGeoParams } from '../../src/dev/devGeo';
import { useCurrentLocationPlace, useLocationStore } from '../../src/location/useLocationStore';
import { useRideRequestStore } from '../../src/store/useRideRequestStore';
import { useSession } from '../../src/session/SessionProvider';

/** Lugar salvo pelo rótulo do atalho (Casa/Trabalho) — `undefined` quando a pessoa ainda não salvou. */
function findSavedPlace(label: string) {
  return MOCK_SAVED_PLACES.find((place) => place.label.toLowerCase() === label.toLowerCase());
}

/**
 * P03 — Início do passageiro (`docs/fichas-de-tela/P03-inicio.md`). PP-9: menu ☰ no lugar das abas; PP-6: sem banner
 * de promessa; PP-2: categoria e "Solicitar corrida" moram na P05.
 *
 * Fatia G6: o mapa mostra a POSIÇÃO DO APARELHO (`src/location`), com o nome que o servidor dá ao ponto
 * (`geoPort.reverse`) e o aviso de fora da área atendida. Sem posição (recusa, erro, aparelho sem o módulo), nada é
 * inventado: a P04 abre com a origem para digitar. O número fixo de notificações (3) saiu: não havia notificação real
 * por trás dele (ficha §10, "tirar o número até existir").
 */
export default function PassengerHomeScreen() {
  useDevGeoParams('reverse');

  const { mode: sessionMode } = useSession();
  const destination = useRideRequestStore((state) => state.destination);
  const setRoute = useRideRequestStore((state) => state.setRoute);
  const setDestination = useRideRequestStore((state) => state.setDestination);

  const locationStatus = useLocationStore((state) => state.status);
  const placeStatus = useLocationStore((state) => state.placeStatus);
  const placeLabel = useLocationStore((state) => state.placeLabel);
  const inServiceArea = useLocationStore((state) => state.inServiceArea);
  const ensureLocationStarted = useLocationStore((state) => state.ensureStarted);
  const requestLocationPermission = useLocationStore((state) => state.requestPermission);
  const relocate = useLocationStore((state) => state.relocate);
  const currentPlace = useCurrentLocationPlace();

  const [menuVisible, setMenuVisible] = useState(false);

  useEffect(() => {
    ensureLocationStarted();
  }, [ensureLocationStarted]);

  /**
   * Atalho com lugar salvo: com a posição do aparelho, o trajeto já está completo e vai direto para a P05 (ficha §6).
   * Sem posição, o destino fica escolhido e a P04 abre pedindo só a origem.
   */
  function goToSavedPlace(place: Place) {
    if (currentPlace) {
      setRoute(currentPlace, place);
      router.push('/categoria');
      return;
    }
    setDestination(place);
    router.push('/destino');
  }

  const casaPlace = findSavedPlace('Casa');
  const trabalhoPlace = findSavedPlace('Trabalho');

  const quickAccessItems: readonly QuickAccessItem[] = [
    {
      key: 'casa',
      label: casaPlace ? 'Casa' : 'Salvar Casa',
      icon: <HomeIcon size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />,
      onPress: casaPlace ? () => goToSavedPlace(casaPlace) : () => router.push('/destino'),
    },
    {
      key: 'trabalho',
      label: trabalhoPlace ? 'Trabalho' : 'Salvar Trabalho',
      icon: <Briefcase size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />,
      onPress: trabalhoPlace ? () => goToSavedPlace(trabalhoPlace) : () => router.push('/destino'),
    },
    {
      key: 'favoritos',
      label: 'Favoritos',
      icon: <Star size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />,
      onPress: () => router.push('/destino'),
    },
  ];

  return (
    <AppShell scroll glow>
      <View style={styles.content}>
        <HomeHeader onPressMenu={() => setMenuVisible(true)} />
        <NetworkBanner testID="home-network-banner" />
        {sessionMode === 'mock' ? (
          <MockBadge label="acesso simulado, sem autenticação real" testID="simulated-access-badge" />
        ) : null}
        <GreetingRow passengerName="Juliana" />
        <DestinationSearchBar onPress={() => router.push('/destino')} destinationAddress={destination?.address} />
        <QuickAccessGrid items={quickAccessItems} />

        {/* Ficha P03 §2: o mapa sangra até a borda e o pé da tela — por isso é o ÚLTIMO
            elemento do conteúdo rolável, com `bleed` cancelando o padding do `AppShell`. */}
        <HomeMapPreview
          status={locationStatus}
          placeStatus={placeStatus}
          placeLabel={placeLabel}
          inServiceArea={inServiceArea}
          onAllowLocation={requestLocationPermission}
          onRelocate={relocate}
          onTypeAddress={() => router.push('/destino')}
          bleed
        />
      </View>

      <HomeMenuSheet
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onPressTrips={() => router.push('/historico')}
        onPressProfile={() => router.push('/perfil')}
        onPressSettings={() => router.push('/configuracoes')}
        onPressHelp={() => router.push('/ajuda')}
        testID="home-menu"
      />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: theme.spacing['5'] },
});
