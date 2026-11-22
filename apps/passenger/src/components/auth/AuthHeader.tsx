import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { BrandLogo, focusRingStyle, theme, textStyle, useKeyboardFocusRing } from '@vuumbora/ui';

export interface AuthHeaderProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly onBack?: () => void;
  /**
   * A prancha de 22/11 não tem logo em "Criar conta" (só no login/boas-vindas, ficha
   * P02 item 4). Padrão `true` para não mudar quem já chama sem a prop; as telas sem
   * logo (cadastro, código, esqueci/redefinir senha) passam `false` explicitamente.
   */
  readonly showLogo?: boolean;
}

/**
 * Cabeçalho das telas de login/cadastro (P02-criar-conta.webp): seta de voltar
 * isolada no topo, logo centralizada (só quando `showLogo`), depois título e
 * subtítulo da tela — layout diferente do `ScreenHeader` genérico (que coloca
 * título ao lado da seta), por isso fica local em vez de forçar uma variação no
 * pacote compartilhado.
 */
export const AuthHeader = memo(function AuthHeader({ title, subtitle, onBack, showLogo = true }: AuthHeaderProps) {
  return (
    <View style={styles.root}>
      {onBack ? <BackButton onPress={onBack} /> : null}
      {showLogo ? (
        <View style={styles.logoRow}>
          <BrandLogo variant="lockup" size="sm" />
        </View>
      ) : null}
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
  // Absoluto (não ocupa altura de fluxo): a seta fica no canto superior esquerdo sem empurrar a
  // logo/título pra baixo — em 320×568 essa altura reservada (44 + gap) era o que sobrava do CTA
  // de /login e /cadastro pra fora da tela (achado da auditoria do portão da onda 0, não é
  // regressão dela: o mesmo corte já existia em `main` antes, só não tinha sido medido nessa
  // largura). A logo é centralizada e começa em x=80 (320pt), a seta mora em x=8-52 — não colidem.
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
