import { useState } from 'react';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { StyleSheet, Text, View } from 'react-native';
import { Lock, Mail, Phone, User } from 'lucide-react-native';
import { AppShell, PasswordInput, PhoneInput, PrimaryButton, TextInput, theme, textStyle } from '@vuumbora/ui';
import { AuthHeader } from '../../src/components/auth/AuthHeader';
import { SocialSignInSection } from '../../src/components/auth/SocialSignInSection';
import { SOCIAL_SIGN_IN_ENABLED } from '../../src/config/featureFlags';
import { cadastroSchema, type CadastroFormValues } from '../../src/schemas/authSchemas';
import { simulateAuthRequest } from '../../src/lib/simulateAuthRequest';
import { useSession } from '../../src/session/SessionProvider';
import { fieldErrorProps } from '../../src/lib/fieldErrorProps';

/**
 * P02 — Criar conta (VuumBora_Claude_Design_System/referencias/premium/passageiro/
 * P02-criar-conta.webp). Nenhuma autenticação real existe: ao validar, simula a
 * chamada e abre a sessão de demonstração (`useSession().signInWithMock`) — a Home
 * mostra o selo de simulado.
 */
export default function CadastroScreen() {
  const { signInWithMock } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);

  const { control, handleSubmit } = useForm<CadastroFormValues>({
    resolver: zodResolver(cadastroSchema),
    defaultValues: { name: '', phone: '', email: '', password: '' },
    mode: 'onBlur',
  });

  async function onSubmit(values: CadastroFormValues) {
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      await simulateAuthRequest(values);
      // A guarda de `app/_layout.tsx` troca (auth) por (app) quando a sessão abre.
      signInWithMock();
    } catch {
      setSubmitError('Não foi possível concluir o cadastro agora. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell scroll testID="cadastro-screen">
      <View style={styles.content}>
        <AuthHeader title="Criar conta" subtitle="Informe seus dados para começar." onBack={() => router.back()} />

        <View style={styles.form}>
          <Controller
            control={control}
            name="name"
            render={({ field, fieldState }) => (
              <TextInput
                label="Nome completo"
                placeholder="Seu nome completo"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                autoCapitalize="words"
                leftAccessory={<User size={18} color={theme.role.textMuted} strokeWidth={1.75} />}
                accessibilityLabel="Nome completo"
                testID="cadastro-name-input"
              />
            )}
          />

          <Controller
            control={control}
            name="phone"
            render={({ field, fieldState }) => (
              <PhoneInput
                label="Celular (WhatsApp)"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                leftAccessory={<Phone size={18} color={theme.role.textMuted} strokeWidth={1.75} />}
                accessibilityLabel="Celular com WhatsApp"
                testID="cadastro-phone-input"
              />
            )}
          />

          <Controller
            control={control}
            name="email"
            render={({ field, fieldState }) => (
              <TextInput
                label="E-mail"
                placeholder="seu@email.com"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                leftAccessory={<Mail size={18} color={theme.role.textMuted} strokeWidth={1.75} />}
                accessibilityLabel="E-mail"
                testID="cadastro-email-input"
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field, fieldState }) => (
              <PasswordInput
                label="Senha"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                leftAccessory={<Lock size={18} color={theme.role.textMuted} strokeWidth={1.75} />}
                accessibilityLabel="Senha"
                testID="cadastro-password-input"
              />
            )}
          />
        </View>

        <View style={styles.actions}>
          <PrimaryButton
            label="Cadastrar"
            onPress={() => {
              void handleSubmit(onSubmit)();
            }}
            loading={submitting}
            {...(submitError !== undefined ? { error: true, errorMessage: submitError } : { error: false })}
            accessibilityLabel="Cadastrar"
            testID="cadastro-submit-button"
          />

          {SOCIAL_SIGN_IN_ENABLED ? <SocialSignInSection /> : null}

          <Text style={styles.footerText}>
            Já tem uma conta?{' '}
            <Text
              style={styles.footerLink}
              onPress={() => router.push('/login')}
              accessibilityRole="button"
              accessibilityLabel="Entrar"
              testID="cadastro-go-to-login-link"
            >
              Entrar
            </Text>
          </Text>
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['6'] },
  form: { gap: theme.spacing['4'] },
  actions: { gap: theme.spacing['4'] },
  footerText: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
  footerLink: { color: theme.role.ctaBackground, ...textStyle('semibold', 'small') },
});
