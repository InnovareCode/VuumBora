import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { StyleSheet, View, type ViewInstance } from 'react-native';
import { Mail } from 'lucide-react-native';
import { AppShell, LinkButton, PrimaryButton, TextInput, formatWait, theme } from '@vuumbora/ui';
import { AuthErrorAlert } from '../../src/components/auth/AuthErrorAlert';
import { AuthHeader } from '../../src/components/auth/AuthHeader';
import { describeAuthError, type AuthErrorView } from '../../src/identity/authErrors';
import { useAuthFlowStore } from '../../src/identity/authFlowStore';
import { identity } from '../../src/identity/identityClient';
import { safeCall } from '../../src/identity/safeCall';
import { useRetryLock } from '../../src/identity/useRetryLock';
import { goBackOr } from '../../src/navigation/goBack';
import { useFocusAfterRender } from '../../src/lib/focusAfterRender';
import { forgotSchema, type ForgotFormValues } from '../../src/schemas/authSchemas';
import { fieldErrorProps } from '../../src/lib/fieldErrorProps';

/**
 * Esqueci a senha — recuperação SÓ por e-mail (o contrato não aceita celular). O servidor responde igual exista a
 * conta ou não (e igual para conta não confirmada), então a tela NUNCA diz se o e-mail tem conta: o texto fala em
 * "se estiver cadastrado" e o sucesso leva sempre à tela de redefinir. Erros: e-mail inválido (a mensagem vai NO campo,
 * que fica `aria-invalid` e recebe o foco), `too_many_attempts` (contagem), rede e serviço indisponível (aviso, que
 * recebe o foco).
 */
export default function EsqueciSenhaScreen() {
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<{ readonly view: AuthErrorView; readonly attempt: number } | null>(null);
  const lock = useRetryLock();
  const alertRef = useRef<ViewInstance>(null);
  const focusAfterRender = useFocusAfterRender();

  const { control, handleSubmit, setError, setFocus } = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
    mode: 'onBlur',
  });
  const email = useWatch({ control, name: 'email' });
  const waitSeconds = lock.secondsFor(email.trim().toLowerCase());
  const locked = waitSeconds > 0;

  async function onSubmit(values: ForgotFormValues) {
    if (submitting || locked) return;
    const typed = values.email.trim();
    setFailure(null);
    setSubmitting(true);
    const result = await safeCall(() => identity.forgotPassword({ email: typed }));
    setSubmitting(false);

    if (result.ok) {
      useAuthFlowStore.getState().startReset({ email: typed, resendAfterSeconds: result.data.resendAfterSeconds });
      router.push('/redefinir-senha');
      return;
    }
    const view = describeAuthError('code_request', result.error);
    if (view.presentation === 'field' && view.field === 'email') {
      // `invalid_email` do servidor: erro DO CAMPO (texto embaixo dele + aria-invalid), não do aviso geral.
      setError('email', { type: 'server', message: view.message });
      focusAfterRender(() => setFocus('email'));
      return;
    }
    if (view.key === 'too_many_attempts' && view.retryAfterSeconds !== undefined) {
      lock.lockFor(view.retryAfterSeconds, typed.toLowerCase());
    }
    setFailure((previous) => ({ view, attempt: (previous?.attempt ?? 0) + 1 }));
    focusAfterRender(() => alertRef.current?.focus());
  }

  const submit = handleSubmit(onSubmit);

  return (
    <AppShell scroll testID="esqueci-senha-screen">
      <View style={styles.content}>
        <AuthHeader
          title="Esqueci a senha"
          subtitle="Informe o e-mail da sua conta. Se ele estiver cadastrado e confirmado, enviaremos um código para você criar uma nova senha."
          onBack={() => goBackOr('/login')}
        />

        <View style={styles.form}>
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
                textContentType="emailAddress"
                autoCorrect={false}
                inputRef={field.ref}
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
                leftAccessory={<Mail size={18} color={theme.role.textMuted} strokeWidth={1.75} />}
                testID="esqueci-email-input"
              />
            )}
          />
        </View>

        <View style={styles.actions}>
          {failure !== null ? (
            <AuthErrorAlert
              key={failure.attempt}
              view={failure.view}
              waitSeconds={waitSeconds}
              alertRef={alertRef}
              testID="esqueci-alert"
            />
          ) : null}
          <PrimaryButton
            label={locked ? `Aguarde ${formatWait(waitSeconds)}` : 'Enviar código'}
            onPress={() => void submit()}
            loading={submitting}
            disabled={locked}
            accessibilityLabel={locked ? `Enviar código, disponível em ${formatWait(waitSeconds)}` : 'Enviar código'}
            testID="esqueci-submit-button"
          />
          <LinkButton label="Voltar para entrar" onPress={() => goBackOr('/login')} testID="esqueci-back-link" />
        </View>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['6'] },
  form: { gap: theme.spacing['4'] },
  actions: { gap: theme.spacing['3'] },
});
