import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Briefcase, Home as HomeIcon, Star } from 'lucide-react-native';
import { AppShell, MockBadge, NetworkBanner, theme } from '@vuumbora/ui';
import { HomeHeader } from '../../src/components/home/HomeHeader';
import { HomeMenuSheet } from '../../src/components/home/HomeMenuSheet';
import { GreetingRow } from '../../src/components/home/GreetingRow';
import { HomeMapPreview } from '../../src/components/home/HomeMapPreview';
import { DestinationSearchBar } from '../../src/components/home/DestinationSearchBar';
import { QuickAccessGrid, type QuickAccessItem } from '../../src/components/home/QuickAccessGrid';
import { MOCK_SAVED_PLACES } from '../../src/data/mockPlaces';
import { useRideRequestStore } from '../../src/store/useRideRequestStore';
import { useSession } from '../../src/session/SessionProvider';

/** Lugar salvo pelo rótulo do atalho (Casa/Trabalho) — `undefined` quando a pessoa ainda não salvou. */
function findSavedPlace(label: string) {
  return MOCK_SAVED_PLACES.find((place) => place.label.toLowerCase() === label.toLowerCase());
}

/**
 * P03 — Início/mapa do passageiro (`docs/fichas-de-tela/P03-inicio.md`, onda 2 do padrão
 * premium). PP-9/D-06 (decidido): menu ☰ no lugar da barra de 4 abas — a antiga tinha
 * "Mensagens" sem ação nenhuma (G-19). PP-6/D-07 (decidido): o banner de segurança/promoção saiu
 * — prometia "motoristas verificados", "suporte 24h" e "10% OFF", nenhum real
 * (`DESIGN_SYSTEM_MESTRE.md` §9); o espaço fica vazio até existir um fato verdadeiro para pôr ali.
 *
 * PP-2 (onda 3, decidido pelo Atlas): categoria e "Solicitar corrida" SAÍRAM da Home de verdade
 * — iam contra a própria spec (P03 não tem categoria) e contra a prancha. Foram para a P05
 * (`(app)/categoria.tsx`): o fluxo agora é destino (P04) → categoria (P05) → confirmação (P06).
 * Os atalhos com endereço salvo (Casa/Trabalho) continuam chamando `setDestination` (que já
 * dispara a cotação — F08b, `requestedCategory`/`quoteCategories` preservados sem alteração),
 * mas agora navegam para a P05 em vez de só atualizar uma seção que não existe mais aqui.
 */
export default function PassengerHomeScreen() {
  const { mode: sessionMode } = useSession();
  const destination = useRideRequestStore((state) => state.destination);
  const setDestination = useRideRequestStore((state) => state.setDestination);
  const [menuVisible, setMenuVisible] = useState(false);

  // G-19 (achado do portão onda 2, ainda válido na onda 3): os 3 atalhos não tinham ação
  // nenhuma. Com endereço salvo (hoje sempre tem, `MOCK_SAVED_PLACES`), o toque define o
  // destino (dispara a cotação) e leva direto à P05 — o mesmo destino que escolher o lugar na
  // P04 alcançaria. Sem endereço salvo, o rótulo vira "Salvar {label}" e o toque leva à P04
  // (não há onde salvar um lugar ainda). Favoritos não tem um único lugar fixo — leva direto à
  // P04, que já abre na seção "Lugares salvos".
  const casaPlace = findSavedPlace('Casa');
  const trabalhoPlace = findSavedPlace('Trabalho');

  const quickAccessItems: readonly QuickAccessItem[] = [
    {
      key: 'casa',
      label: casaPlace ? 'Casa' : 'Salvar Casa',
      icon: <HomeIcon size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />,
      onPress: casaPlace
        ? () => {
            setDestination(casaPlace);
            router.push('/categoria');
          }
        : () => router.push('/destino'),
    },
    {
      key: 'trabalho',
      label: trabalhoPlace ? 'Trabalho' : 'Salvar Trabalho',
      icon: <Briefcase size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />,
      onPress: trabalhoPlace
        ? () => {
            setDestination(trabalhoPlace);
            router.push('/categoria');
          }
        : () => router.push('/destino'),
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
        <HomeHeader notificationCount={3} onPressMenu={() => setMenuVisible(true)} />
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
          cityLabel="Natal - RN"
          currentAddress="Ponta Negra, Natal - RN"
          landmarkLabel="Morro do Careca"
          bleed
        />
      </View>

      <HomeMenuSheet
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onPressTrips={() => router.push('/historico')}
        onPressProfile={() => router.push('/perfil')}
        onPressSettings={() => router.push('/configuracoes')}
        testID="home-menu"
      />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, gap: theme.spacing['5'] },
});
