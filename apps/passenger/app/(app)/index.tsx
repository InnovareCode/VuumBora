import { useState } from 'react';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Briefcase, Car, Home as HomeIcon, Package, PawPrint, Star, UserRound, type LucideIcon } from 'lucide-react-native';
import {
  AppShell,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  MockBadge,
  NetworkBanner,
  PrimaryButton,
  SectionHeader,
  theme,
  textStyle,
  type VehicleIllustrationVariant,
} from '@vuumbora/ui';
import { HomeHeader } from '../../src/components/home/HomeHeader';
import { HomeMenuSheet } from '../../src/components/home/HomeMenuSheet';
import { GreetingRow } from '../../src/components/home/GreetingRow';
import { HomeMapPreview } from '../../src/components/home/HomeMapPreview';
import { DestinationSearchBar } from '../../src/components/home/DestinationSearchBar';
import { QuickAccessGrid, type QuickAccessItem } from '../../src/components/home/QuickAccessGrid';
import { RideCategoryCard } from '../../src/components/home/RideCategoryCard';
import { rideCategoryName, type RideCategoryKey } from '../../src/data/rideCategoryDisplay';
import { formatQuotePickupEta, formatQuotePrice } from '../../src/utils/rideQuoteFormatting';
import { MOCK_SAVED_PLACES } from '../../src/data/mockPlaces';
import { useRideRequestStore } from '../../src/store/useRideRequestStore';
import { useSession } from '../../src/session/SessionProvider';

/** Lugar salvo pelo rótulo do atalho (Casa/Trabalho) — `undefined` quando a pessoa ainda não salvou. */
function findSavedPlace(label: string) {
  return MOCK_SAVED_PLACES.find((place) => place.label.toLowerCase() === label.toLowerCase());
}

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
 * P03 — Início/mapa do passageiro (`docs/fichas-de-tela/P03-inicio.md`, onda 2 do padrão
 * premium). PP-9/D-06 (decidido): menu ☰ no lugar da barra de 4 abas — a antiga tinha
 * "Mensagens" sem ação nenhuma (G-19). PP-6/D-07 (decidido): o banner de segurança/promoção saiu
 * — prometia "motoristas verificados", "suporte 24h" e "10% OFF", nenhum real
 * (`DESIGN_SYSTEM_MESTRE.md` §9); o espaço fica vazio até existir um fato verdadeiro para pôr ali.
 *
 * PP-2 diz que categoria/"Solicitar corrida" saem para a P05 — mas a F08b já fez a Home tirar as
 * categorias de VERDADE da cotação (`quoteCategories`, com carregando/erro/vazio reais), e a P05
 * ainda não existe. Por pedido do Atlas nesta fatia, a seção de categorias e o invariante do
 * recibo (`requestedCategory`, só setado por `setCategory`/`refreshQuote` na store) continuam
 * como estavam — não foram tocados.
 */
export default function PassengerHomeScreen() {
  const { mode: sessionMode } = useSession();
  const destination = useRideRequestStore((state) => state.destination);
  const categoryId = useRideRequestStore((state) => state.categoryId);
  const setCategory = useRideRequestStore((state) => state.setCategory);
  const quoteStatus = useRideRequestStore((state) => state.quoteStatus);
  const quoteCategories = useRideRequestStore((state) => state.quoteCategories);
  const refreshQuote = useRideRequestStore((state) => state.refreshQuote);
  const setDestination = useRideRequestStore((state) => state.setDestination);
  const [menuVisible, setMenuVisible] = useState(false);

  const canProceed = Boolean(destination && categoryId);

  function handleRequestRide() {
    if (!canProceed) return;
    router.push('/confirmacao');
  }

  // G-19 (achado do portão onda 2): os 3 atalhos não tinham ação nenhuma. Com endereço salvo
  // (hoje sempre tem, `MOCK_SAVED_PLACES`), o toque faz o MESMO que escolher o lugar na P04:
  // define o destino via `setDestination` (que já dispara a cotação) — sem navegar, a seção
  // "Escolha sua viagem" abaixo atualiza na própria Home. Sem endereço salvo, o rótulo vira
  // "Salvar {label}" e o toque leva à P04 (não há onde salvar um lugar ainda). Favoritos não tem
  // um único lugar fixo — leva direto à P04, que já abre na seção "Lugares salvos".
  const casaPlace = findSavedPlace('Casa');
  const trabalhoPlace = findSavedPlace('Trabalho');

  const quickAccessItems: readonly QuickAccessItem[] = [
    {
      key: 'casa',
      label: casaPlace ? 'Casa' : 'Salvar Casa',
      icon: <HomeIcon size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />,
      onPress: casaPlace ? () => setDestination(casaPlace) : () => router.push('/destino'),
    },
    {
      key: 'trabalho',
      label: trabalhoPlace ? 'Trabalho' : 'Salvar Trabalho',
      icon: <Briefcase size={20} color={theme.role.ctaBackground} strokeWidth={1.75} />,
      onPress: trabalhoPlace ? () => setDestination(trabalhoPlace) : () => router.push('/destino'),
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

        <View style={styles.categorySection}>
          <SectionHeader
            title="Escolha sua viagem"
            mock={quoteStatus === 'ready' && quoteCategories.length > 0}
            mockLabel="preço estimado de demonstração"
            testID="categories-section-header"
          />

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
  categorySection: { gap: theme.spacing['3'] },
  categoryColumn: { gap: theme.spacing['2'] },
  helperText: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
});
