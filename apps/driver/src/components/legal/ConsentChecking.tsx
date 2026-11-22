import { StyleSheet, Text, View } from 'react-native';
import { AppShell, LoadingSkeleton, theme, textStyle } from '@vuumbora/ui';

/**
 * Enquanto `me()` diz se há Termos/Política a reaceitar (`useConsentGate`): uma tela de espera em vez da Home. Sem ela
 * a Home apareceria por um instante para quem tem reaceite pendente e depois seria trocada — e o toque nesse instante
 * já seria um passo dentro do app sem o aceite.
 */
export function ConsentChecking() {
  return (
    <AppShell testID="consent-checking-screen">
      <View style={styles.center}>
        <Text style={styles.text} accessibilityLiveRegion="polite">
          Verificando sua conta…
        </Text>
        <LoadingSkeleton lines={2} height={16} width="60%" />
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: theme.spacing['3'] },
  text: { color: theme.role.textSecondary, ...textStyle('regular', 'body'), textAlign: 'center' },
});
