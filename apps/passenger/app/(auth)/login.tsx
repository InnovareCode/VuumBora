import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { StyleSheet, Text, View, type ViewInstance } from 'react-native';
import { Lock, User } from 'lucide-react-native';
import {
  AppShell,
  InlineAlert,
  LinkButton,
  PasswordInput,
  PrimaryButton,
  TextInput,
  formatWait,
  theme,
  textStyle,
} from '@vuumbora/ui';
import { AuthErrorAlert } from '../../src/components/auth/AuthErrorAlert';
import { AuthHeader } from '../../src/components/auth/AuthHeader';
import { describeAuthError, type AuthErrorAction, type AuthErrorView } from '../../src/identity/authErrors';
import { useAuthFlowStore } from '../../src/identity/authFlowStore';
import { identity } from '../../src/identity/identityClient';
import { safeCall } from '../../src/identity/safeCall';
import { useRetryLock } from '../../src/identity/useRetryLock';
import { goBackOr } from '../../src/navigation/goBack';
import { useFocusAfterRender, useFocusWhenScreenFocused } from '../../src/lib/focusAfterRender';
import { loginSchema, type LoginFormValues } from '../../src/schemas/authSchemas';
import { fieldErrorProps } from '../../src/lib/fieldErrorProps';

const NOTICE_TEXT = {
  email_confirmed: 'E-mail confirmado. Agora entre com a sua senha.',
  password_changed: 'Senha alterada. Entre com a nova senha. As sessões em outros aparelhos foram encerradas.',
} as const;

/** A espera do servidor é por par identificador+IP: a chave é o que foi digitado, sem caixa nem espaços. */
function lockKeyOf(identifier: string): string {
  return identifier.trim().toLowerCase();
}

/**
 * Login — e-mail OU ID público + senha (celular não entra: o contrato não aceita). Sessão do cliente de identidade;
 * ao abrir, a guarda de `app/_layout.tsx` troca `(auth)` por `(app)` sozinha — esta tela não navega no sucesso.
 *
 * Estados de erro (todos via `describeAuthError`): `invalid_credentials` (mensagem única, sem dizer qual campo),
 * `email_not_verified` (leva à tela do código), `too_many_attempts` (contagem de `retryAfterSeconds`, botão em espera,
 * nunca "conta bloqueada"), rede e serviço indisponível.
 */
export default function LoginScreen() {
  const loginHint = useAuthFlowStore((state) => state.loginHint);
  const loginNotice = useAuthFlowStore((state) => state.loginNotice);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<{ readonly view: AuthErrorView; readonly attempt: number } | null>(null);
  const lock = useRetryLock();
  // O aviso de erro recebe o foco quando o envio falha (o botão fica indisponível durante o envio e o foco cai no <body>).
  const alertRef = useRef<ViewInstance>(null);
  const focusAfterRender = useFocusAfterRender();

  const { control, handleSubmit, setValue, setFocus } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: loginHint ?? '', password: '' },
    mode: 'onBlur',
  });
  const identifier = useWatch({ control, name: 'identifier' });
  const waitSeconds = lock.secondsFor(lockKeyOf(identifier));
  const locked = waitSeconds > 0;

  // Voltou da confirmação do e-mail / troca de senha: a tela já estava montada embaixo, então o campo é preenchido aqui.
  useEffect(() => {
    if (loginHint !== null) setValue('identifier', loginHint);
  }, [loginHint, setValue]);

  // Chegou com o e-mail já preenchido ("Entrar na minha conta" do cadastro, e-mail confirmado, senha trocada): leva o
  // foco ao primeiro campo. Sem isto ele fica no <body> da tela que saiu (N6 da passada 4 da Íris).
  useFocusWhenScreenFocused(
    () => setFocus('identifier'),
    () => useAuthFlowStore.getState().loginHint !== null,
  );

  async function onSubmit(values: LoginFormValues) {
    if (submitting || locked) return;
    const typed = values.identifier.trim();
    useAuthFlowStore.getState().consumeLoginNotice();
    setFailure(null);
    setSubmitting(true);

    const result = await safeCall(() => identity.login({ identifier: typed, password: values.password }));
    if (result.ok) return; // a sessão abriu: a guarda desmonta esta tela. Não mexe mais em estado dela.
    setSubmitting(false);

    const view = describeAuthError('login', result.error);
    if (view.key === 'email_not_verified') {
      // Senha certa, e-mail pendente: segue para o código (o estado de tela do `email_not_verified` mora lá).
      useAuthFlowStore.getState().startVerification({ identifier: typed, origin: 'login', emailSent: true, resendAfterSeconds: 0 });
      router.push('/codigo');
      return;
    }
    if (view.key === 'too_many_attempts' && view.retryAfterSeconds !== undefined) {
      lock.lockFor(view.retryAfterSeconds, lockKeyOf(typed));
    }
    setFailure((previous) => ({ view, attempt: (previous?.attempt ?? 0) + 1 }));
    focusAfterRender(() => alertRef.current?.focus());
  }

  function handleAction(action: AuthErrorAction) {
    if (action === 'go_forgot') router.push('/esqueci-senha');
  }

  const submit = handleSubmit(onSubmit);

  return (
    <AppShell scroll glow testID="login-screen">
      <View style={styles.content}>
        <AuthHeader title="Entrar" subtitle="Acesse sua conta para continuar." onBack={() => goBackOr('/boas-vindas')} />

        {loginNotice !== null ? <InlineAlert tone="success" message={NOTICE_TEXT[loginNotice]} testID="login-notice" /> : null}

        <View style={styles.form}>
          <Controller
            control={control}
            name="identifier"
            render={({ field, fieldState }) => (
              <TextInput
                label="E-mail ou ID público"
                placeholder="seu@email.com ou seu ID"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="username"
                textContentType="username"
                autoCorrect={false}
                inputRef={field.ref}
                returnKeyType="next"
                onSubmitEditing={() => setFocus('password')}
                leftAccessory={<User size={18} color={theme.role.textMuted} strokeWidth={1.75} />}
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
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                inputRef={field.ref}
                onSubmitEditing={() => void submit()}
                leftAccessory={<Lock size={18} color={theme.role.textMuted} strokeWidth={1.75} />}
                testID="login-password-input"
              />
            )}
          />

          <LinkButton
            label="Esqueci minha senha"
            onPress={() => router.push('/esqueci-senha')}
            align="flex-end"
            testID="login-forgot-link"
          />
        </View>

        <View style={styles.actions}>
          {failure !== null ? (
            <AuthErrorAlert
              key={failure.attempt}
              view={failure.view}
              waitSeconds={waitSeconds}
              onAction={handleAction}
              alertRef={alertRef}
              testID="login-alert"
            />
          ) : null}
          <PrimaryButton
            label={locked ? `Aguarde ${formatWait(waitSeconds)}` : 'Entrar'}
            onPress={() => void submit()}
            loading={submitting}
            disabled={locked}
            accessibilityLabel={locked ? `Entrar, disponível em ${formatWait(waitSeconds)}` : 'Entrar'}
            testID="login-submit-button"
          />
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Não tem conta?</Text>
            <LinkButton label="Cadastre-se" onPress={() => router.push('/cadastro')} testID="login-go-to-cadastro-link" />
          </View>
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['6'] },
  form: { gap: theme.spacing['4'] },
  actions: { gap: theme.spacing['3'] },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
  footerText: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
});
