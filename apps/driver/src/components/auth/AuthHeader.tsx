import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { BrandLogo, focusRingStyle, theme, textStyle, useKeyboardFocusRing } from '@vuumbora/ui';

export interface AuthHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly onBack?: () => void;
}

/**
 * Cabeçalho das telas de conta do motorista: seta de voltar isolada no topo (44pt), logo centralizada, depois título e
 * subtítulo da tela — mesmo desenho do passageiro (`apps/passenger/src/components/auth/AuthHeader.tsx`; os dois apps
 * não importam um do outro, `scripts/check-boundaries.mjs`). Layout diferente do `ScreenHeader` genérico (que coloca o
 * título ao lado da seta), por isso fica local em vez de forçar uma variação no pacote compartilhado.
 */
export const AuthHeader = memo(function AuthHeader({ title, subtitle, onBack }: AuthHeaderProps) {
  return (
    <View style={styles.root}>
      {onBack ? <BackButton onPress={onBack} /> : null}
      <View style={styles.logoRow}>
        <BrandLogo variant="lockup" size="sm" />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
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
  subtitle: {
    color: theme.role.textSecondary,
    ...textStyle('regular', 'body'),
    textAlign: 'center',
    marginTop: theme.spacing['1'],
  },
});
