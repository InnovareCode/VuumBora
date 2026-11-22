import { StyleSheet, Text, View } from 'react-native';
import { AppShell, BrandLogo, MockBadge, PrimaryButton, theme, textStyle } from '@vuumbora/ui';
import { useSession } from '../../src/session/SessionProvider';

/**
 * Entrada do motorista — PLACEHOLDER da M01 (Login), que ainda não foi desenhada nem
 * implementada. Existe só para a guarda de rota ter para onde mandar quem não tem sessão:
 * o botão abre a sessão de DEMONSTRAÇÃO (`useSession().signInWithMock`), sem e-mail, senha ou
 * API. Quando a M01 chegar (docs/plano-apps-execucao.md, Bloco B), esta tela é substituída, não
 * evoluída. Texto sem "cadastro": criar conta e abrir o cadastro de motorista são etapas
 * diferentes (princípio 5 do plano).
 */
export default function DriverEnterScreen() {
  const { signInWithMock } = useSession();

  return (
    <AppShell scroll testID="driver-enter-screen">
      <View style={styles.content}>
        <View style={styles.brandBlock}>
          <BrandLogo variant="lockup" size="lg" />
        </View>

        <View style={styles.textBlock}>
          <Text style={styles.headline} accessibilityRole="header">
            Área do motorista
          </Text>
          <Text style={styles.promise}>
            O login do motorista ainda está em construção. Por enquanto, a demonstração mostra como o painel vai ficar.
          </Text>
        </View>

        <View style={styles.actions}>
          <MockBadge label="acesso simulado, sem autenticação real" testID="driver-enter-mock-badge" />
          <PrimaryButton
            label="Entrar na demonstração"
            onPress={signInWithMock}
            accessibilityLabel="Entrar na demonstração"
            testID="driver-enter-demo-button"
          />
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, gap: theme.spacing['6'] },
  brandBlock: { alignItems: 'center', marginTop: theme.spacing['6'] },
  textBlock: { gap: theme.spacing['3'] },
  headline: { color: theme.role.textPrimary, ...textStyle('bold', 'heading'), textAlign: 'center' },
  promise: { color: theme.role.textSecondary, ...textStyle('regular', 'body'), textAlign: 'center' },
  actions: { gap: theme.spacing['3'] },
});
