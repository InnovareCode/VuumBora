import { router } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AppShell,
  BrandLogo,
  InlineAlert,
  OnboardingBackground,
  PrimaryButton,
  SecondaryButton,
  gradientColors,
  gradientLocations,
  theme,
  textStyle,
} from '@vuumbora/ui';
import { LegalNotice } from '../../src/components/auth/LegalNotice';
import { useSession } from '../../src/session/SessionProvider';

const SCRIM_COLORS = gradientColors(theme.gradient.photoScrim);
const SCRIM_LOCATIONS = gradientLocations(theme.gradient.photoScrim);

/**
 * P01 — Boas-vindas (VuumBora_Claude_Design_System/referencias/premium/passageiro/
 * P01-boas-vindas.webp). Primeira tela de entrada do passageiro: marca, promessa
 * curta, Entrar/Cadastrar e o aviso de termos (com os dois documentos a um toque). Os
 * botões levam às telas de login/cadastro; sessão expirada ou saída sem confirmação do
 * servidor aparecem aqui como aviso (a guarda de `app/_layout.tsx` traz a pessoa para cá).
 *
 * Fundo noturno com scrim (direção de arte §7.1/§9 item 9, maquete
 * `tools/art-assets/onboarding-premium.html`): `OnboardingBackground` cobre a tela
 * inteira atrás do `AppShell` (por isso `transparent`); o bloco de texto/CTA no rodapé
 * fica sobre `gradient.photoScrim` — sem o scrim, o título cai sobre a parte mais clara
 * da foto e o contraste medido cai para 1,49:1 (com scrim: 16,8:1).
 */
export default function WelcomeScreen() {
  const { height } = useWindowDimensions();
  const { signedOutNotice } = useSession();
  // Direção de arte §6: logo menor em telas baixas (<640pt de altura) — abre espaço
  // pro bloco de texto/CTA do rodapé não precisar rolar em 320×568.
  const compact = height < 640;

  return (
    <View style={styles.screen}>
      <OnboardingBackground />
      <AppShell scroll transparent testID="welcome-screen">
        <View style={styles.content}>
          <View style={[styles.brandBlock, compact && styles.brandBlockCompact]}>
            <BrandLogo variant="lockup" size={compact ? 'md' : 'lg'} />
          </View>

          <View style={styles.spacer} />

          <View style={styles.bottomBlock}>
            <LinearGradient colors={SCRIM_COLORS} locations={SCRIM_LOCATIONS} style={styles.scrim} pointerEvents="none" />
            <Text style={styles.headline} accessibilityRole="header">
              Bem-vindo ao <Text style={styles.headlineAccent}>VuumBora!</Text>
            </Text>
            <Text style={styles.promise}>Sua mobilidade urbana com mais praticidade, segurança e economia.</Text>
            {signedOutNotice === 'session_expired' ? (
              <InlineAlert
                tone="warning"
                title="Sua sessão expirou"
                message="Por segurança, entre de novo para continuar."
                testID="welcome-session-expired"
              />
            ) : null}
            {signedOutNotice === 'server_unconfirmed' ? (
              <InlineAlert
                tone="info"
                message="Você saiu deste aparelho. Sem conexão, não conseguimos encerrar a sessão também no servidor."
                testID="welcome-sign-out-unconfirmed"
              />
            ) : null}
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
                size="prominent"
                testID="welcome-cadastro-button"
              />
            </View>
            <LegalNotice />
          </View>
        </View>
      </AppShell>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.role.screen },
  // `AppShell.scrollFill` (flexGrow:1) já estica este `View` até a altura visível da
  // tela (bug_appshell_scroll_sem_flexgrow, 18/11/2026); o `minHeight:480` que existia
  // aqui era fora da escala de 4pt (G-01) e, medido, redundante com essa correção —
  // removido e reconferido nas 4 larguras (G-09/G-11/G-13).
  content: { flex: 1 },
  brandBlock: { alignItems: 'center', marginTop: theme.spacing['6'] },
  brandBlockCompact: { marginTop: theme.spacing['4'] },
  spacer: { flex: 1, minHeight: theme.spacing['4'] },
  // O scrim (`gradient.photoScrim`) cobre uma faixa acima do bloco de texto (não só o
  // bloco em si, `top` negativo) — mesmo recurso da maquete (`.bottom:before`,
  // `top:-96px`), para a transição começar antes do título, não embaixo dele.
  bottomBlock: { position: 'relative', gap: theme.spacing['3'], paddingTop: theme.spacing['6'] },
  scrim: { position: 'absolute', top: -theme.spacing['10'], left: -theme.layout.screenPadding, right: -theme.layout.screenPadding, bottom: -theme.layout.screenPadding },
  headline: { color: theme.role.textPrimary, ...textStyle('bold', 'heading'), textAlign: 'center' },
  headlineAccent: { color: theme.role.ctaBackground },
  promise: {
    color: theme.role.textSecondary,
    ...textStyle('regular', 'body'),
    textAlign: 'center',
    paddingHorizontal: theme.spacing['3'],
  },
  actions: { gap: theme.spacing['3'], marginTop: theme.spacing['3'] },
});
