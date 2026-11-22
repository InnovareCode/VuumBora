/**
 * ButtonCore — base interna de PrimaryButton/SecondaryButton/DangerButton.
 * Não é exportada por `index.ts`. Centraliza os 5 estados exigidos pelo DS:
 * padrão, pressionado, desabilitado (cores sólidas, sem opacidade), carregando
 * (spinner substitui o rótulo, interação bloqueada) e erro (borda `dangerFill`
 * + legenda com ícone, nunca só cor).
 *
 * Direção de arte (docs/direcao-de-arte.md §4/§5/§9 item 3): o botão primário (CTA)
 * ganhou gradiente de marca, o "brilho" de 1px em cima/embaixo medido na referência
 * (nunca um halo) e sombra escura própria. O secundário ganhou a borda iluminada de
 * cima (item 2) e o gradiente sutil de superfície (mesmo token do botão cheio do
 * motorista, "Recusar" — ver §3.1 do doc).
 */
import { memo, useCallback, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { theme, tokens, type BoxShadowValue } from '@vuumbora/tokens';
import { withAlpha } from './colorAlpha';
import { gradientColors, gradientLocations } from './gradient';
import { PressableScale, type PressableScaleRenderState } from './PressableScale';
import { glyphStyle, textStyle } from './typography';
import { focusRingStyle, useKeyboardFocusRing } from './useFocusRing';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
/** `prominent` força a altura de CTA principal (56pt, 52 com janela curta) em qualquer variante — §15: "Recusar e Aceitar da mesma altura" (M6). `primary` já é `prominent` por padrão. */
export type ButtonSize = 'default' | 'prominent';

const CTA_COLORS = gradientColors(theme.gradient.cta);
const CTA_LOCATIONS = gradientLocations(theme.gradient.cta);
const OVERLAY_COLORS = gradientColors(theme.gradient.surfaceOverlay);
const OVERLAY_LOCATIONS = gradientLocations(theme.gradient.surfaceOverlay);

// Fundo tingido do botão "danger" (auditoria A3: "rgba(208,42,56,.10)") — calculado a
// partir do token, nunca um HEX literal (ver colorAlpha.ts).
const DANGER_TINT = withAlpha(theme.role.dangerFill, 0.1);

// Anel de foco de teclado, FORA do botão com vão de 2pt: separa o botão do fundo escuro sem tocar no rótulo, na borda de
// contorno nem no gradiente. O contorno padrão do navegador some no WebKit (1,08:1) — ver `useFocusRing.ts`.
const FOCUS_RING = focusRingStyle('outside', theme.radius.md);

// "Brilho" do CTA medido na referência: 1px claro em cima + 1px quente embaixo,
// NUNCA halo (ver docs/direcao-de-arte.md §0/§4). `boxShadow` com `inset` é a única
// forma do RN desenhar isso sem camada extra — confirmado com fonte da própria
// react-native@0.88.1 (ReactAndroid tem Drawables nativos dedicados a inset/outset
// box-shadow: InsetBoxShadowDrawable.kt/OutsetBoxShadowDrawable.kt). Não é só prop
// experimental de web; ainda assim, ninguém validou num Android físico — ver
// PENDÊNCIAS do handoff da Lyra antes de espalhar esta técnica para mais componentes.
const CTA_SHADOW: readonly BoxShadowValue[] = [
  ...theme.elevation.cta,
  { offsetX: 0, offsetY: 1, color: tokens.color.highlight.ctaRimLight, inset: true },
  { offsetX: 0, offsetY: -1, color: tokens.color.highlight.ctaRimWarm, inset: true },
];

export interface ButtonCoreProps {
  readonly variant: ButtonVariant;
  readonly label: string;
  /** Ícone à esquerda do rótulo (cor já resolvida pelo chamador). Oculto durante `loading`. */
  readonly icon?: ReactNode;
  readonly onPress?: (event: GestureResponderEvent) => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly error?: boolean;
  readonly errorMessage?: string;
  /** `prominent`: altura de CTA (56/52pt) mesmo em `secondary`/`danger` — ver `ButtonSize`. */
  readonly size?: ButtonSize;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

interface VisualState {
  readonly text: string;
  readonly borderColor: string;
  readonly borderTopColor: string;
  readonly borderWidth: number;
  /** Só o variant="primary": fundo é gradiente cheio de marca, não cor plana. */
  readonly ctaGradient: boolean;
  /** Só o variant="secondary": fundo é o gradiente sutil de superfície (§3.1, botão cheio). */
  readonly overlayGradient: boolean;
  readonly flatBackground: string | undefined;
}

function getVisualState(variant: ButtonVariant, pressed: boolean, disabled: boolean, error: boolean): VisualState {
  // secondary E danger são contorno (direção de arte §3.1): desabilitado, os dois caem
  // no mesmo tratamento neutro (borda + fundo surfaceElevated), sem cor de ação.
  const hasOutline = variant === 'secondary' || variant === 'danger';

  if (disabled) {
    return {
      text: theme.role.textMuted,
      borderColor: hasOutline ? theme.role.borderControl : 'transparent',
      borderTopColor: hasOutline ? theme.role.borderControl : 'transparent',
      borderWidth: hasOutline ? 1.5 : 0,
      // CTA desabilitado: gradient.surfaceOverlay, sem rim nem sombra (spec §4/§9 item 3).
      ctaGradient: false,
      overlayGradient: variant === 'primary',
      flatBackground: hasOutline ? theme.role.surfaceElevated : undefined,
    };
  }

  switch (variant) {
    case 'primary':
      return {
        text: theme.role.ctaText,
        borderColor: 'transparent',
        borderTopColor: 'transparent',
        borderWidth: 0,
        ctaGradient: !pressed,
        overlayGradient: false,
        // Pressionado = brand.yellowPressed chapado (sem gradiente) — medido na referência.
        flatBackground: pressed ? theme.role.ctaBackgroundPressed : undefined,
      };
    case 'secondary':
      return {
        text: theme.role.textPrimary,
        borderColor: error ? theme.role.dangerFill : theme.role.edgeBottom,
        borderTopColor: error ? theme.role.dangerFill : theme.role.edgeTop,
        borderWidth: 1.5,
        ctaGradient: false,
        overlayGradient: !pressed,
        flatBackground: pressed ? theme.role.surface : undefined,
      };
    case 'danger':
      // Direção de arte §3.1: cancelar não é a ação principal da tela — contorno
      // vermelho + fundo levemente tingido (nunca vermelho cheio, que virava o maior
      // bloco de cor da tela e competia com o CTA — auditoria A3). Texto em `danger`
      // (claro, para o contorno); borda e tingimento usam `dangerFill` como referência
      // de cor, igual à régua do botão secundário (borda cheia, fundo a 10%).
      return {
        text: theme.role.danger,
        borderColor: theme.role.dangerFill,
        borderTopColor: theme.role.dangerFill,
        borderWidth: 1.5,
        ctaGradient: false,
        overlayGradient: false,
        flatBackground: DANGER_TINT,
      };
  }
}

export const ButtonCore = memo(function ButtonCore({
  variant,
  label,
  icon,
  onPress,
  disabled = false,
  loading = false,
  error = false,
  errorMessage,
  size,
  accessibilityLabel,
  testID,
}: ButtonCoreProps) {
  const isInteractive = !disabled && !loading;
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  const { height: windowHeight } = useWindowDimensions();
  // Direção de arte §6/§9 item 3: 56pt de altura para o CTA principal, 52 quando a
  // altura da janela aperta (< 640pt) — mesma régua usada para o onboarding. `primary`
  // é sempre proeminente; `secondary`/`danger` só quando `size="prominent"` (§15: botões
  // da mesma linha de decisão precisam da mesma altura, ex. Recusar/Aceitar em M6).
  const primaryHeight = windowHeight < 640 ? theme.layout.buttonHeight : theme.layout.buttonHeightProminent;
  const isProminent = variant === 'primary' || size === 'prominent';

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (!isInteractive) return;
      onPress?.(event);
    },
    [isInteractive, onPress]
  );

  return (
    <View>
      <PressableScale
        {...focusProps}
        onPress={handlePress}
        style={focusVisible ? FOCUS_RING : undefined}
        disabled={!isInteractive}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: !isInteractive, busy: loading }}
        aria-busy={loading}
        testID={testID}
      >
        {({ pressed }: PressableScaleRenderState) => {
          const v = getVisualState(variant, pressed, disabled, error);
          const content = loading ? (
            <ActivityIndicator color={v.text} />
          ) : (
            <View style={styles.content}>
              {icon ? <View style={styles.icon}>{icon}</View> : null}
              <Text style={[styles.label, { color: v.text }]} numberOfLines={2}>
                {label}
              </Text>
            </View>
          );

          // boxShadow precisa estar NO MESMO elemento que tem o fundo/borderRadius —
          // numa View separada por fora, o shadow sai quadrado (sem acompanhar o radius).
          const base = [
            styles.base,
            isProminent ? { minHeight: primaryHeight } : undefined,
            {
              borderColor: v.borderColor,
              borderTopColor: v.borderTopColor,
              borderWidth: v.borderWidth,
              opacity: variant === 'danger' && pressed && isInteractive ? 0.85 : 1,
            },
            v.flatBackground ? { backgroundColor: v.flatBackground } : undefined,
            variant === 'primary' && !disabled ? { boxShadow: CTA_SHADOW } : undefined,
          ];

          if (v.ctaGradient) {
            return (
              <LinearGradient colors={CTA_COLORS} locations={CTA_LOCATIONS} style={base}>
                {content}
              </LinearGradient>
            );
          }
          if (v.overlayGradient) {
            return (
              <LinearGradient colors={OVERLAY_COLORS} locations={OVERLAY_LOCATIONS} style={base}>
                {content}
              </LinearGradient>
            );
          }
          return <View style={base}>{content}</View>;
        }}
      </PressableScale>
      {error && errorMessage ? (
        <View style={styles.errorRow} accessibilityRole="alert">
          <Text style={styles.errorGlyph}>✕</Text>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  base: {
    minHeight: theme.layout.buttonHeight,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing['6'],
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['2'] },
  icon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  label: { ...textStyle('semibold', 'body'), textAlign: 'center' },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing['1'],
    marginTop: theme.spacing['1'],
  },
  // Glifo (✕): fonte do sistema de propósito — ver nota em typography.ts.
  errorGlyph: { color: theme.role.danger, ...glyphStyle(theme.typography.weight.bold, 'small') },
  errorText: { color: theme.role.danger, ...textStyle('regular', 'small') },
});
