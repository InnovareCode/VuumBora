import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Briefcase, Calendar, Car, Home as HomeIcon, MessageCircle, Package, PawPrint, Star, User, UserRound, type LucideIcon } from 'lucide-react-native';
import {
  AppShell,
  BottomTabBar,
  type BottomTabBarItem,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  MockBadge,
  PrimaryButton,
  theme,
  textStyle,
  type VehicleIllustrationVariant,
} from '@vuumbora/ui';
import { HomeHeader } from '../../src/components/home/HomeHeader';
import { GreetingRow } from '../../src/components/home/GreetingRow';
import { HomeMapPreview } from '../../src/components/home/HomeMapPreview';
import { DestinationSearchBar } from '../../src/components/home/DestinationSearchBar';
import { QuickAccessGrid, type QuickAccessItem } from '../../src/components/home/QuickAccessGrid';
import { RideCategoryCard } from '../../src/components/home/RideCategoryCard';
import { SafetyPromoBanner } from '../../src/components/home/SafetyPromoBanner';
import { rideCategoryName, type RideCategoryKey } from '../../src/data/rideCategoryDisplay';
import { formatQuotePickupEta, formatQuotePrice } from '../../src/utils/rideQuoteFormatting';
import { useRideRequestStore } from '../../src/store/useRideRequestStore';
import { useSession } from '../../src/session/SessionProvider';

const QUICK_ACCESS_ITEMS: readonly QuickAccessItem[] = [
  { key: 'casa', label: 'Casa', subtitle: 'Ponta Negra', icon: <HomeIcon size={20} color={theme.role.ctaBackground} strokeWidth={1.75} /> },
  { key: 'trabalho', label: 'Trabalho', subtitle: 'Centro, Natal', icon: <Briefcase size={20} color={theme.role.ctaBackground} strokeWidth={1.75} /> },
  { key: 'favoritos', label: 'Favoritos', subtitle: 'Meus destinos', icon: <Star size={20} color={theme.role.ctaBackground} strokeWidth={1.75} /> },
  // "Agendar" ainda não existe de verdade (sem tela/fluxo de agendamento) — por isso `mock`.
  { key: 'agendar', label: 'Agendar', subtitle: 'Escolha data e hora', icon: <Calendar size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />, mock: true },
];

/**
 * Como cada categoria CONHECIDA aparece no card: as duas que são o próprio veículo mostram a
 * ilustração do carro; as demais, só o símbolo. A arte `economico` é a do nível de entrada. F08b:
 * isto é só aparência — QUAIS categorias existem vem da cotação (`quoteCategories` da store), nunca
 * desta lista; uma categoria que a cotação devolver e não estiver aqui cai no ícone genérico
 * (`DEFAULT_CATEGORY_ICON`), sem quebrar a tela.
 */
const CATEGORY_VISUALS: Partial<Record<RideCategoryKey, { readonly icon: LucideIcon; readonly vehicleVariant?: VehicleIllustrationVariant }>> = {
  vuumbora: { icon: Car, vehicleVariant: 'economico' },
  conforto: { icon: Car, vehicleVariant: 'comfort' },
  motorista_mulher: { icon: UserRound },
  entrega: { icon: Package },
  pet: { icon: PawPrint },
};
const DEFAULT_CATEGORY_ICON: LucideIcon = Car;

function categoryVisual(categoryId: string): { readonly icon: LucideIcon; readonly vehicleVariant?: VehicleIllustrationVariant } {
  return CATEGORY_VISUALS[categoryId as RideCategoryKey] ?? { icon: DEFAULT_CATEGORY_ICON };
}

/**
 * P03 — Início/mapa do passageiro (VuumBora_Claude_Design_System/referencias/passageiro_home.png).
 * Tela só de UI: nenhuma das ações abaixo (destino, atalhos, solicitar corrida, abas) chama uma API
 * real ainda — não existe contrato/endpoint definido (pendência para Vega). A lista de categorias
 * (abaixo) é a exceção desde a F08b: vem de `port.quote` (mock da porta de corrida), por isso tem
 * estado de carregamento/erro/vazio de verdade, não só "sempre pronta".
 */
export default function PassengerHomeScreen() {
  const { mode: sessionMode } = useSession();
  const destination = useRideRequestStore((state) => state.destination);
  const categoryId = useRideRequestStore((state) => state.categoryId);
  const setCategory = useRideRequestStore((state) => state.setCategory);
  const quoteStatus = useRideRequestStore((state) => state.quoteStatus);
  const quoteCategories = useRideRequestStore((state) => state.quoteCategories);
  const refreshQuote = useRideRequestStore((state) => state.refreshQuote);

  const canProceed = Boolean(destination && categoryId);

  function handleRequestRide() {
    if (!canProceed) return;
    router.push('/confirmacao');
  }

  const tabs: readonly BottomTabBarItem[] = [
    { key: 'inicio', label: 'Início', icon: ({ color, active }) => <HomeIcon size={22} color={color} strokeWidth={active ? 2.25 : 1.75} />, onPress: () => {} },
    { key: 'viagens', label: 'Viagens', icon: ({ color, active }) => <Car size={22} color={color} strokeWidth={active ? 2.25 : 1.75} />, onPress: () => router.push('/historico') },
    {
      key: 'mensagens',
      label: 'Mensagens',
      icon: ({ color, active }) => <MessageCircle size={22} color={color} strokeWidth={active ? 2.25 : 1.75} />,
      badgeCount: 2,
      onPress: () => {},
    },
    { key: 'perfil', label: 'Perfil', icon: ({ color, active }) => <User size={22} color={color} strokeWidth={active ? 2.25 : 1.75} />, onPress: () => router.push('/perfil') },
  ];

  return (
    <AppShell scroll glow footer={<BottomTabBar items={tabs} activeKey="inicio" testID="home-tab-bar" />}>
      <View style={styles.content}>
        <HomeHeader notificationCount={3} />
        {sessionMode === 'mock' ? (
          <MockBadge label="acesso simulado, sem autenticação real" testID="simulated-access-badge" />
        ) : null}
        <GreetingRow passengerName="Juliana" />
        <HomeMapPreview cityLabel="Natal - RN" currentAddress="Ponta Negra, Natal - RN" landmarkLabel="Morro do Careca" />
        <DestinationSearchBar onPress={() => router.push('/destino')} destinationAddress={destination?.address} />
        <QuickAccessGrid items={QUICK_ACCESS_ITEMS} />

        <View style={styles.categorySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Escolha sua viagem</Text>
            {quoteStatus === 'ready' && quoteCategories.length > 0 ? (
              <MockBadge label="preço estimado de demonstração" testID="categories-mock-badge" />
            ) : null}
          </View>

          {quoteStatus === 'idle' ? (
            <EmptyState
              title="Defina seu destino"
              description="Escolha para onde você vai para ver as opções de viagem disponíveis."
              testID="categories-idle-state"
            />
          ) : quoteStatus === 'loading' ? (
            <View style={styles.categoryColumn} testID="categories-loading-state">
              <LoadingSkeleton variant="block" height={64} lines={3} />
            </View>
          ) : quoteStatus === 'error' ? (
            <ErrorState
              title="Não deu para carregar as opções"
              description="Tente de novo em instantes."
              onRetry={refreshQuote}
              testID="categories-error-state"
            />
          ) : quoteCategories.length === 0 ? (
            <EmptyState
              title="Nenhuma opção disponível"
              description="Não há categoria de viagem para este trajeto agora."
              testID="categories-empty-state"
            />
          ) : (
            <View style={styles.categoryColumn}>
              {quoteCategories.map((category) => {
                const visual = categoryVisual(category.categoryId);
                return (
                  <RideCategoryCard
                    key={category.categoryId}
                    name={rideCategoryName(category.categoryId)}
                    icon={visual.icon}
                    {...(visual.vehicleVariant ? { vehicleVariant: visual.vehicleVariant } : {})}
                    etaLabel={formatQuotePickupEta(category)}
                    priceLabel={formatQuotePrice(category)}
                    selected={categoryId === category.categoryId}
                    onPress={() => setCategory(category.categoryId)}
                    testID={`ride-category-${category.categoryId}`}
                  />
                );
              })}
            </View>
          )}
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
            {destination ? 'Escolha uma categoria de viagem para continuar.' : 'Defina seu destino para continuar.'}
          </Text>
        ) : null}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['5'] },
  categorySection: { gap: theme.spacing['3'] },
  // Título e selo empilhados: o selo "preço estimado de demonstração" (~200pt) não cabe ao lado do título em 320pt.
  sectionHeader: { gap: theme.spacing['2'] },
  sectionTitle: { color: theme.role.textPrimary, ...textStyle('bold', 'body') },
  categoryColumn: { gap: theme.spacing['2'] },
  helperText: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
});
