import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MockBadge, SecondaryButton, theme, textStyle } from '@vuumbora/ui';

/**
 * "Continuar com Google/Apple" (P02-criar-conta.webp) — login social é decisão de
 * negócio pendente (docs/decisoes-do-dono.md item 8: obriga conta de desenvolvedor
 * nas duas plataformas e, no iOS, oferecer Apple se oferecer Google). Por isso os
 * botões ficam SEMPRE desabilitados e marcados com `MockBadge`, sem nenhum SDK de
 * login social instalado.
 */
export const SocialSignInSection = memo(function SocialSignInSection() {
  return (
    <View style={styles.root}>
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>ou</Text>
        <View style={styles.dividerLine} />
      </View>

      <MockBadge label="login social pendente de decisão" testID="social-signin-mock-badge" />

      <SecondaryButton
        label="Continuar com Google"
        disabled
        accessibilityLabel="Continuar com Google — ainda não disponível"
        testID="social-signin-google"
      />
      <SecondaryButton
        label="Continuar com Apple"
        disabled
        accessibilityLabel="Continuar com Apple — ainda não disponível"
        testID="social-signin-apple"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { gap: theme.spacing['3'] },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing['3'] },
  dividerLine: { flex: 1, height: 1, backgroundColor: theme.role.border },
  dividerText: { color: theme.role.textMuted, ...textStyle('regular', 'small') },
});
