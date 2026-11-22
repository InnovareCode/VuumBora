import { memo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme, type BoxShadowValue } from '@vuumbora/tokens';

export interface FooterActionsProps {
  readonly children: ReactNode;
  /**
   * `true` (padrão) quando há conteúdo rolando por baixo — ganha `elevation.3` para se
   * separar dele (§11). Em tela sem rolagem (ex.: o CTA já está colado no fim de um
   * conteúdo fixo), passar `false` evita uma sombra sem conteúdo para separar.
   */
  readonly elevated?: boolean;
  readonly testID?: string;
}

const SHADOW: readonly BoxShadowValue[] = theme.elevation['3'];

/**
 * CTA fixo no rodapé (C-04, `docs/padrao-premium-telas.md` §11/§15): passar como `footer`
 * do `AppShell` (mesmo slot que a `BottomTabBar`, nunca rola com o conteúdo). Fica acima
 * do indicador de gestos com `spacing.2` (8pt) de respiro — por isso o padding de baixo é
 * o inset da área segura MAIS esse respiro, não só o inset.
 */
export const FooterActions = memo(function FooterActions({ children, elevated = true, testID }: FooterActionsProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.root, elevated && styles.elevated, { paddingBottom: insets.bottom + theme.spacing['2'] }]}
      testID={testID}
    >
      {children}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    backgroundColor: theme.role.surface,
    paddingHorizontal: theme.layout.screenPadding,
    paddingTop: theme.spacing['3'],
    gap: theme.spacing['3'],
  },
  elevated: { boxShadow: SHADOW },
});
