/**
 * @vuumbora/ui — biblioteca de componentes TRANSVERSAIS (DESIGN_SYSTEM_MESTRE §6, "Sistema transversal").
 *
 * Entram aqui: AppShell, ScreenHeader, BrandLogo, PrimaryButton, SecondaryButton, DangerButton,
 * TextInput, PasswordInput, PhoneInput, SearchInput, InfoCard, MetricCard, StatusBadge, Toast,
 * Modal, BottomSheet, BottomTabBar, Avatar, StarRating, EmptyState, ErrorState, LoadingSkeleton,
 * e um MockBadge para sinalizar dados de demonstração.
 *
 * NÃO entram aqui componentes de um único perfil (RideCategoryCard, OnlineToggle, RideOfferCard...):
 * esses vivem em apps/<perfil>/src/components. MapView/RouteOverlay/LocationMarker ficam atrás de
 * um adaptador de mapa (SDK ainda não escolhido) — ver docs/decisions.md.
 *
 * Regras: estilos só via `theme` (nenhum HEX/dimensão literal); todo componente interativo tem
 * props tipadas, estados loading/disabled/error, rótulo de acessibilidade e teste de interação.
 *
 * Estado atual: scaffold — nenhum componente implementado ainda (Etapa A).
 */
export { theme, tokens } from '@vuumbora/tokens';
export type { Theme, Tokens } from '@vuumbora/tokens';
