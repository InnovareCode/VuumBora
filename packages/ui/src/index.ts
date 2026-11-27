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
 * Identidade (B1, 21/11/2026 — usados pelo passageiro e prontos para o motorista, B2): CodeInput (código de
 * 6 dígitos), DateInput (DD/MM/AAAA + `brazilianDateToIso`), ConsentCheckbox (aceite com acesso ao texto),
 * LinkButton (link com alvo de 44pt), InlineAlert (aviso com tom, glifo e ações) e `useSecondsUntil`/`formatWait`
 * (contagem regressiva por instante). Ainda NÃO estão em apps/passenger/app/catalogo.tsx.
 *
 * Estado atual: catálogo base implementado (ver apps/passenger/app/catalogo.tsx). Avatar,
 * MockBadge, BottomTabBar e StarRating entraram depois da Etapa A inicial — ainda
 * faltam no catálogo visual (apps/passenger/app/catalogo.tsx).
 *
 * Onda 0 do F09 (22/11/2026, `docs/padrao-premium-telas.md` §15): PressableScale (C-13),
 * NetworkBanner/useNetworkStatus (C-01), ConfirmDialog (C-03, o "Modal" do DS), FooterActions
 * (C-04), Toast (C-05), SectionHeader (C-07), ListRow/ToggleSwitch (C-08), MoneyText/
 * EstimateLabel (C-10), SegmentedControl (C-16). Nenhum ainda está no catálogo visual nem foi
 * adotado por uma tela (esta fatia não altera `apps/*​/app`).
 * Faltam: BottomSheet (C-02) e o adaptador de mapa (MapView/RouteOverlay/LocationMarker,
 * C-12) — fora deste escopo.
 */
export { theme, tokens } from '@vuumbora/tokens';
export type { Theme, Tokens, GradientStop, BoxShadowValue, CubicBezier } from '@vuumbora/tokens';

export { textStyle, textStyleForSize, tabularNums, glyphStyle } from './typography';
export type { TextWeightKey, TextSizeKey } from './typography';

export { gradientColors, gradientLocations } from './gradient';

export { withAlpha } from './colorAlpha';

export { SurfaceRaised } from './SurfaceRaised';
export type { SurfaceRaisedProps } from './SurfaceRaised';

export { AppShell } from './AppShell';
export type { AppShellProps } from './AppShell';

export { ScreenHeader } from './ScreenHeader';
export type { ScreenHeaderProps, ScreenHeaderAlign } from './ScreenHeader';

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
export type { TextInputHandle } from './InputCore';

export { PasswordInput } from './PasswordInput';
export type { PasswordInputProps } from './PasswordInput';

export { PhoneInput } from './PhoneInput';
export type { PhoneInputProps } from './PhoneInput';

export { SearchInput } from './SearchInput';
export type { SearchInputProps } from './SearchInput';

export { CodeInput } from './CodeInput';
export type { CodeInputProps } from './CodeInput';

export { DateInput, maskBrazilianDate, brazilianDateToIso } from './DateInput';
export type { DateInputProps } from './DateInput';

export { ConsentCheckbox } from './ConsentCheckbox';
export type { ConsentCheckboxProps } from './ConsentCheckbox';

export { LinkButton } from './LinkButton';
export type { LinkButtonProps } from './LinkButton';

export { useKeyboardFocusRing, focusRingStyle, focusRingLayerStyle, NO_BROWSER_OUTLINE } from './useFocusRing';
export type { FocusRingPlacement, KeyboardFocusRing } from './useFocusRing';

export { PressableScale } from './PressableScale';
export type { PressableScaleProps, PressableScaleRenderState } from './PressableScale';

export { InlineAlert } from './InlineAlert';
export type { InlineAlertProps, InlineAlertTone } from './InlineAlert';

export { useSecondsUntil, formatWait } from './countdown';

export { InfoCard } from './InfoCard';
export type { InfoCardProps } from './InfoCard';

export { MetricCard } from './MetricCard';
export type { MetricCardProps, MetricTrend } from './MetricCard';

export { StatusBadge } from './StatusBadge';
export type { StatusBadgeProps, StatusBadgeVariant } from './StatusBadge';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps, EmptyStateIconProps } from './EmptyState';

export { ErrorState } from './ErrorState';
export type { ErrorStateProps, ErrorStateIconProps } from './ErrorState';

export { LoadingSkeleton } from './LoadingSkeleton';
export type { LoadingSkeletonProps, LoadingSkeletonVariant } from './LoadingSkeleton';

export { Avatar } from './Avatar';
export type { AvatarProps, AvatarSize, AvatarDiameter, AvatarSizeName } from './Avatar';
export { AVATAR_DIAMETERS } from './avatarScale';

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

// Onda 0 do F09 — ver nota no topo deste arquivo.
export { useNetworkStatus } from './useNetworkStatus';

export { NetworkBanner } from './NetworkBanner';
export type { NetworkBannerProps } from './NetworkBanner';

export { ConfirmDialog } from './ConfirmDialog';
export type { ConfirmDialogProps } from './ConfirmDialog';

export { FooterActions } from './FooterActions';
export type { FooterActionsProps } from './FooterActions';

export { Toast } from './Toast';
export type { ToastProps } from './Toast';

export { SectionHeader } from './SectionHeader';
export type { SectionHeaderProps } from './SectionHeader';

export { ListRow } from './ListRow';
export type { ListRowProps, ListRowToggleProps } from './ListRow';

export { ToggleSwitch } from './ToggleSwitch';
export type { ToggleSwitchProps } from './ToggleSwitch';

export { MoneyText, EstimateLabel, formatBRL } from './MoneyText';
export type { MoneyTextProps, EstimateLabelProps } from './MoneyText';

export { SegmentedControl } from './SegmentedControl';
export type { SegmentedControlProps, SegmentedControlOption } from './SegmentedControl';

// Camada do APARELHO compartilhada pelos dois apps (A3/B-6; não é visual): cofre da sessão e "baixar e conferir".
// Cada app cria o seu cofre uma vez, em `src/identity/identityClient.ts`; a lógica fica em `src/device/`.
export { createDeviceSessionStorage } from './device/deviceSessionStorage';
export type { DeviceAccountType } from './device/sessionKeys';
export type { GuardedSessionStorage } from './device/sessionVault';
export { VerifiedTextView } from './VerifiedTextView';
export type { VerifiedTextViewProps } from './VerifiedTextView';
