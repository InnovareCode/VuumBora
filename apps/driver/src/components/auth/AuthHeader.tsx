import { memo } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { BrandLogo, focusRingStyle, theme, textStyle, useKeyboardFocusRing } from '@vuumbora/ui';

export interface AuthHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly onBack?: () => void;
  /**
   * `lockup` (ícone + nome + tagline) é o lockup de entrada, só para a tela-âncora sem seta de voltar (M01, ficha:
   * "lockup md 240"). `selo` (só o ícone, 44pt) é para as telas de fluxo COM seta de voltar (M02 em diante, ficha
   * M02: "selo do logo 44"). Padrão `lockup` para não quebrar quem já chama sem a prop.
   */
  readonly logoVariant?: 'lockup' | 'selo';
  /** M01 pede o título à esquerda (prancha); as demais telas de conta mantêm centralizado. Padrão `center`. */
  readonly titleAlign?: 'center' | 'left';
}

/**
 * Cabeçalho das telas de conta do motorista: seta de voltar isolada no topo (44pt), logo centralizada, depois título e
 * subtítulo da tela — mesmo desenho do passageiro (`apps/passenger/src/components/auth/AuthHeader.tsx`; os dois apps
 * não importam um do outro, `scripts/check-boundaries.mjs`). Layout diferente do `ScreenHeader` genérico (que coloca o
 * título ao lado da seta), por isso fica local em vez de forçar uma variação no pacote compartilhado.
 */
export const AuthHeader = memo(function AuthHeader({
  title,
  subtitle,
  onBack,
  logoVariant = 'lockup',
  titleAlign = 'center',
}: AuthHeaderProps) {
  const { height } = useWindowDimensions();
  // Direção de arte §6 (mesmo corte usado em `boas-vindas.tsx` do passageiro): lockup menor em tela baixa
  // (<640pt de altura) pra abrir espaço pro formulário. O `selo` já nasce pequeno (44pt) e não precisa encolher.
  const lockupSize = height < 640 ? 'sm' : 'md';
  return (
    <View style={styles.root}>
      {onBack ? <BackButton onPress={onBack} /> : null}
      <View style={styles.logoRow}>
        <BrandLogo variant={logoVariant} size={logoVariant === 'lockup' ? lockupSize : 'md'} />
      </View>
      <Text style={[styles.title, titleAlign === 'left' && styles.titleLeft]} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={[styles.subtitle, titleAlign === 'left' && styles.subtitleLeft]}>{subtitle}</Text> : null}
    </View>
  );
});

// Dentro da caixa de 44pt: o ícone é pequeno e centrado, e o alvo encosta na borda da tela (um anel de fora seria cortado).
// O contorno padrão do navegador some contra o fundo escuro no WebKit — ver `useFocusRing.ts` em @vuumbora/ui.
const FOCUS_RING = focusRingStyle('inside', theme.radius.md);

/** "Voltar": estado de foco próprio (componente à parte para o cabeçalho inteiro não renderizar a cada Tab). */
const BackButton = memo(function BackButton({ onPress }: { readonly onPress: () => void }) {
  const { focusVisible, focusProps } = useKeyboardFocusRing();
  return (
    <Pressable
      {...focusProps}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Voltar"
      hitSlop={8}
      style={[styles.backButton, focusVisible && FOCUS_RING]}
    >
      <ChevronLeft size={24} color={theme.role.textPrimary} strokeWidth={2} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  root: { gap: theme.spacing['2'], position: 'relative' },
  // Absoluto (não ocupa altura de fluxo) — ver o mesmo comentário em
  // `apps/passenger/src/components/auth/AuthHeader.tsx` (os dois não importam um do outro).
  backButton: {
    position: 'absolute',
    top: 0,
    left: -theme.spacing['2'],
    width: theme.layout.touchTarget,
    height: theme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  logoRow: { alignItems: 'center', marginBottom: theme.spacing['2'] },
  title: { color: theme.role.textPrimary, ...textStyle('bold', 'heading'), textAlign: 'center' },
  titleLeft: { textAlign: 'left' },
  subtitle: {
    color: theme.role.textSecondary,
    ...textStyle('regular', 'body'),
    textAlign: 'center',
    marginTop: theme.spacing['1'],
  },
  subtitleLeft: { textAlign: 'left' },
});
