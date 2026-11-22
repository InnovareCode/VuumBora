import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { BrandLogo, theme, textStyle } from '@vuumbora/ui';

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
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          hitSlop={8}
          style={styles.backButton}
        >
          <ChevronLeft size={24} color={theme.role.textPrimary} strokeWidth={2} />
        </Pressable>
      ) : null}
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

const styles = StyleSheet.create({
  root: { gap: theme.spacing['2'] },
  backButton: {
    width: theme.layout.touchTarget,
    height: theme.layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -theme.spacing['2'],
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
