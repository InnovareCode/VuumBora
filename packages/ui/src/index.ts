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
 * Estado atual: catálogo base implementado (ver apps/passenger/app/catalogo.tsx). Avatar,
 * MockBadge, BottomTabBar e StarRating entraram depois da Etapa A inicial — ainda
 * faltam no catálogo visual (apps/passenger/app/catalogo.tsx).
 * Faltam: Toast, Modal, BottomSheet e o adaptador de mapa
 * (MapView/RouteOverlay/LocationMarker) — fora deste escopo.
 */
export { theme, tokens } from '@vuumbora/tokens';
export type { Theme, Tokens, GradientStop, BoxShadowValue } from '@vuumbora/tokens';

export { textStyle, textStyleForSize, tabularNums, glyphStyle } from './typography';
export type { TextWeightKey, TextSizeKey } from './typography';

export { gradientColors, gradientLocations } from './gradient';

export { withAlpha } from './colorAlpha';

export { SurfaceRaised } from './SurfaceRaised';
export type { SurfaceRaisedProps } from './SurfaceRaised';

export { AppShell } from './AppShell';
export type { AppShellProps } from './AppShell';

export { ScreenHeader } from './ScreenHeader';
export type { ScreenHeaderProps } from './ScreenHeader';

export { BrandLogo } from './BrandLogo';
export type { BrandLogoProps, BrandLogoSize, BrandLogoVariant } from './BrandLogo';

export { PrimaryButton } from './PrimaryButton';
export type { PrimaryButtonProps } from './PrimaryButton';

export { SecondaryButton } from './SecondaryButton';
export type { SecondaryButtonProps } from './SecondaryButton';

export { DangerButton } from './DangerButton';
export type { DangerButtonProps } from './DangerButton';

export { TextInput } from './TextInput';
export type { TextInputProps } from './TextInput';

export { PasswordInput } from './PasswordInput';
export type { PasswordInputProps } from './PasswordInput';

export { PhoneInput } from './PhoneInput';
export type { PhoneInputProps } from './PhoneInput';

export { SearchInput } from './SearchInput';
export type { SearchInputProps } from './SearchInput';

export { InfoCard } from './InfoCard';
export type { InfoCardProps } from './InfoCard';

export { MetricCard } from './MetricCard';
export type { MetricCardProps, MetricTrend } from './MetricCard';

export { StatusBadge } from './StatusBadge';
export type { StatusBadgeProps, StatusBadgeVariant } from './StatusBadge';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { ErrorState } from './ErrorState';
export type { ErrorStateProps } from './ErrorState';

export { LoadingSkeleton } from './LoadingSkeleton';
export type { LoadingSkeletonProps, LoadingSkeletonVariant } from './LoadingSkeleton';

export { Avatar } from './Avatar';
export type { AvatarProps, AvatarSize } from './Avatar';

export { MockBadge } from './MockBadge';
export type { MockBadgeProps } from './MockBadge';

export { BottomTabBar } from './BottomTabBar';
export type { BottomTabBarProps, BottomTabBarItem } from './BottomTabBar';

export { StarRating } from './StarRating';
export type { StarRatingProps, StarRatingIconProps } from './StarRating';

export { VehicleIllustration } from './VehicleIllustration';
export type { VehicleIllustrationProps, VehicleIllustrationVariant } from './VehicleIllustration';

export { MapPreviewBackground } from './MapPreviewBackground';
export type { MapPreviewBackgroundProps, MapPreviewVariant } from './MapPreviewBackground';

export { driverDemoAvatarSource } from './demoAssets';

export { OnboardingBackground } from './OnboardingBackground';
export type { OnboardingBackgroundProps } from './OnboardingBackground';
