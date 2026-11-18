import { useState } from 'react';
import { router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { StyleSheet, Text, View } from 'react-native';
import { Lock, User } from 'lucide-react-native';
import { AppShell, PasswordInput, PrimaryButton, TextInput, theme, textStyle } from '@vuumbora/ui';
import { AuthHeader } from '../src/components/auth/AuthHeader';
import { UnavailableNoticeBanner } from '../src/components/auth/UnavailableNoticeBanner';
import { loginSchema, type LoginFormValues } from '../src/schemas/authSchemas';
import { simulateAuthRequest } from '../src/lib/simulateAuthRequest';
import { fieldErrorProps } from '../src/lib/fieldErrorProps';

/**
 * Login — sem referência própria (derivada de P02-criar-conta.webp). Nenhuma
 * autenticação real existe: ao validar, simula a chamada e segue para a Home
 * marcando a entrada como simulada.
 */
export default function LoginScreen() {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [recoveryNoticeVisible, setRecoveryNoticeVisible] = useState(false);

  const { control, handleSubmit } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
    mode: 'onBlur',
  });

  async function onSubmit(values: LoginFormValues) {
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      await simulateAuthRequest(values);
      router.replace({ pathname: '/', params: { simulated: '1' } });
    } catch {
      setSubmitError('Não foi possível entrar agora. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell scroll testID="login-screen">
      <View style={styles.content}>
        <AuthHeader title="Entrar" subtitle="Acesse sua conta para continuar." onBack={() => router.back()} />

        <View style={styles.form}>
          <Controller
            control={control}
            name="identifier"
            render={({ field, fieldState }) => (
              <TextInput
                label="E-mail ou celular"
                placeholder="seu@email.com ou celular"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                autoCapitalize="none"
                leftAccessory={<User size={18} color={theme.role.textMuted} strokeWidth={1.75} />}
                accessibilityLabel="E-mail ou celular"
                testID="login-identifier-input"
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
                testID="login-password-input"
              />
            )}
          />

          <Text
            style={styles.recoveryLink}
            onPress={() => setRecoveryNoticeVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Recuperar acesso — ainda não disponível"
            testID="login-recovery-link"
          >
            Recuperar acesso
          </Text>
          {recoveryNoticeVisible ? (
            <UnavailableNoticeBanner
              message="Recuperação de senha ainda não está disponível — não existe backend de autenticação nesta versão."
              testID="login-recovery-notice"
            />
          ) : null}
        </View>

        <View style={styles.actions}>
          <PrimaryButton
            label="Entrar"
            onPress={() => {
              void handleSubmit(onSubmit)();
            }}
            loading={submitting}
            {...(submitError !== undefined ? { error: true, errorMessage: submitError } : { error: false })}
            accessibilityLabel="Entrar"
            testID="login-submit-button"
          />
          <Text style={styles.footerText}>
            Não tem conta?{' '}
            <Text
              style={styles.footerLink}
              onPress={() => router.push('/cadastro')}
              accessibilityRole="button"
              accessibilityLabel="Cadastrar"
              testID="login-go-to-cadastro-link"
            >
              Cadastrar
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
  recoveryLink: {
    color: theme.role.ctaBackground,
    ...textStyle('semibold', 'small'),
    textAlign: 'right',
  },
  actions: { gap: theme.spacing['4'] },
  footerText: { color: theme.role.textSecondary, ...textStyle('regular', 'small'), textAlign: 'center' },
  footerLink: { color: theme.role.ctaBackground, ...textStyle('semibold', 'small') },
});
