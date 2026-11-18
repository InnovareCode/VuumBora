import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { AppShell, BrandLogo, PrimaryButton, SecondaryButton, theme, textStyle } from '@vuumbora/ui';
import { LegalNotice } from '../src/components/auth/LegalNotice';

/**
 * P01 — Boas-vindas (VuumBora_Claude_Design_System/referencias/premium/passageiro/
 * P01-boas-vindas.webp). Primeira tela de entrada do passageiro: marca, promessa
 * curta, Entrar/Cadastrar e o aviso de termos. Sem autenticação real — os botões só
 * navegam para as telas de login/cadastro.
 */
export default function WelcomeScreen() {
  return (
    <AppShell scroll testID="welcome-screen">
      <View style={styles.content}>
        <View style={styles.brandBlock}>
          <BrandLogo variant="lockup" size="lg" />
          <Text style={styles.headline}>
            Bem-vindo ao <Text style={styles.headlineAccent}>VuumBora!</Text>
          </Text>
          <Text style={styles.promise}>Sua mobilidade urbana com mais praticidade, segurança e economia.</Text>
        </View>

        <View style={styles.spacer} />

        <View style={styles.actions}>
          <PrimaryButton
            label="Entrar"
            onPress={() => router.push('/login')}
            accessibilityLabel="Entrar"
            testID="welcome-login-button"
          />
          <SecondaryButton
            label="Cadastrar"
            onPress={() => router.push('/cadastro')}
            accessibilityLabel="Cadastrar"
            testID="welcome-cadastro-button"
          />
          <LegalNotice />
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, minHeight: 480, gap: theme.spacing['6'] },
  brandBlock: { alignItems: 'center', gap: theme.spacing['3'], marginTop: theme.spacing['6'] },
  headline: { color: theme.role.textPrimary, ...textStyle('bold', 'heading'), textAlign: 'center' },
  headlineAccent: { color: theme.role.ctaBackground },
  promise: {
    color: theme.role.textSecondary,
    ...textStyle('regular', 'body'),
    textAlign: 'center',
    paddingHorizontal: theme.spacing['3'],
  },
  spacer: { flex: 1, minHeight: theme.spacing['6'] },
  actions: { gap: theme.spacing['3'] },
});
