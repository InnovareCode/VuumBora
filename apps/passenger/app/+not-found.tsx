import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AppShell, BrandLogo, PrimaryButton, textStyle, theme } from '@vuumbora/ui';

/**
 * Rota que não existe (URL errada no web, link antigo). Substitui a tela padrão do Expo Router ("Unmatched Route",
 * em inglês, com um link para o `/_sitemap`, que lista as rotas do app). O texto é nosso, em português, e a única
 * saída é o início: `/` é a Home para quem tem sessão e vira as boas-vindas para quem não tem (a guarda do
 * `_layout.tsx` raiz decide), então o mesmo botão serve nos dois casos e esta tela não precisa saber da sessão.
 */
export default function NotFoundScreen() {
  return (
    <AppShell scroll testID="not-found-screen">
      <View style={styles.content}>
        <BrandLogo variant="lockup" size="sm" />
        <View style={styles.text}>
          <Text style={styles.title} accessibilityRole="header">
            Página não encontrada
          </Text>
          <Text style={styles.description}>
            O endereço que você abriu não existe ou mudou de lugar. Volte para o início e continue por lá.
          </Text>
        </View>
        <View style={styles.action}>
          <PrimaryButton label="Ir para o início" onPress={() => router.replace('/')} testID="not-found-home-button" />
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing['6'] },
  text: { gap: theme.spacing['2'], alignItems: 'center' },
  title: { color: theme.role.textPrimary, ...textStyle('bold', 'heading'), textAlign: 'center' },
  description: { color: theme.role.textSecondary, ...textStyle('regular', 'body'), textAlign: 'center' },
  action: { width: '100%' },
});
