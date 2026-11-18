import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Briefcase, Calendar, Car, Home as HomeIcon, MessageCircle, Star, User } from 'lucide-react-native';
import { AppShell, BottomTabBar, type BottomTabBarItem, MockBadge, PrimaryButton, theme, textStyle } from '@vuumbora/ui';
import { HomeHeader } from '../src/components/home/HomeHeader';
import { GreetingRow } from '../src/components/home/GreetingRow';
import { HomeMapPreview } from '../src/components/home/HomeMapPreview';
import { DestinationSearchBar } from '../src/components/home/DestinationSearchBar';
import { QuickAccessGrid, type QuickAccessItem } from '../src/components/home/QuickAccessGrid';
import { RideCategoryCard } from '../src/components/home/RideCategoryCard';
import { SafetyPromoBanner } from '../src/components/home/SafetyPromoBanner';
import { MOCK_RIDE_CATEGORIES } from '../src/data/mockRideCategories';
import { useRideRequestStore } from '../src/store/useRideRequestStore';

const QUICK_ACCESS_ITEMS: readonly QuickAccessItem[] = [
  { key: 'casa', label: 'Casa', subtitle: 'Ponta Negra', icon: <HomeIcon size={20} color={theme.role.ctaBackground} strokeWidth={1.75} /> },
  { key: 'trabalho', label: 'Trabalho', subtitle: 'Centro, Natal', icon: <Briefcase size={20} color={theme.role.ctaBackground} strokeWidth={1.75} /> },
  { key: 'favoritos', label: 'Favoritos', subtitle: 'Meus destinos', icon: <Star size={20} color={theme.role.ctaBackground} strokeWidth={1.75} /> },
  // "Agendar" ainda não existe de verdade (sem tela/fluxo de agendamento) — por isso `mock`.
  { key: 'agendar', label: 'Agendar', subtitle: 'Escolha data e hora', icon: <Calendar size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />, mock: true },
];

/**
 * P03 — Início/mapa do passageiro (VuumBora_Claude_Design_System/referencias/passageiro_home.png).
 * Tela só de UI: nenhuma das ações abaixo (destino, atalhos, categoria, solicitar corrida, abas)
 * chama uma API real ainda — não existe contrato/endpoint definido (pendência para Vega).
 */
export default function PassengerHomeScreen() {
  const destination = useRideRequestStore((state) => state.destination);
  const categoryId = useRideRequestStore((state) => state.categoryId);
  const setCategory = useRideRequestStore((state) => state.setCategory);

  const canProceed = Boolean(destination);

  function handleRequestRide() {
    if (!canProceed) return;
    router.push('/confirmacao');
  }

  const tabs: readonly BottomTabBarItem[] = [
    { key: 'inicio', label: 'Início', icon: ({ color, active }) => <HomeIcon size={22} color={color} strokeWidth={active ? 2.25 : 1.75} />, onPress: () => {} },
    { key: 'viagens', label: 'Viagens', icon: ({ color, active }) => <Car size={22} color={color} strokeWidth={active ? 2.25 : 1.75} />, onPress: () => {} },
    {
      key: 'mensagens',
      label: 'Mensagens',
      icon: ({ color, active }) => <MessageCircle size={22} color={color} strokeWidth={active ? 2.25 : 1.75} />,
      badgeCount: 2,
      onPress: () => {},
    },
    { key: 'perfil', label: 'Perfil', icon: ({ color, active }) => <User size={22} color={color} strokeWidth={active ? 2.25 : 1.75} />, onPress: () => {} },
  ];

  return (
    <AppShell scroll footer={<BottomTabBar items={tabs} activeKey="inicio" testID="home-tab-bar" />}>
      <View style={styles.content}>
        <HomeHeader notificationCount={3} />
        <GreetingRow passengerName="Juliana" />
        <HomeMapPreview cityLabel="Natal - RN" currentAddress="Ponta Negra, Natal - RN" landmarkLabel="Morro do Careca" />
        <DestinationSearchBar onPress={() => router.push('/destino')} destinationAddress={destination?.address} />
        <QuickAccessGrid items={QUICK_ACCESS_ITEMS} />

        <View style={styles.categorySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Escolha sua viagem</Text>
            <MockBadge label="preço e tempo estimados" />
          </View>
          <View style={styles.categoryRow}>
            {MOCK_RIDE_CATEGORIES.map((category) => (
              <RideCategoryCard
                key={category.key}
                name={category.name}
                etaLabel={category.etaLabel}
                priceLabel={category.priceLabel}
                selected={categoryId === category.key}
                onPress={() => setCategory(category.key)}
              />
            ))}
          </View>
        </View>

        <SafetyPromoBanner />

        <PrimaryButton
          label="Solicitar corrida"
          icon={<Car size={20} color={theme.role.ctaText} strokeWidth={2.25} />}
          onPress={handleRequestRide}
          disabled={!canProceed}
          accessibilityLabel="Solicitar corrida"
          testID="request-ride-button"
        />
        {!canProceed ? (
          <Text style={styles.helperText} accessibilityRole="alert">
            Defina seu destino para continuar.
          </Text>
        ) : null}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['5'] },
  categorySection: { gap: theme.spacing['3'] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing['2'] },
  sectionTitle: { color: theme.role.textPrimary, ...textStyle('bold', 'body') },
  categoryRow: { flexDirection: 'row', gap: theme.spacing['2'] },
  helperText: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
});
