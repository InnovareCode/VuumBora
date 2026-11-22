import { useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { StyleSheet, View, type ViewInstance } from 'react-native';
import { Lock, Mail } from 'lucide-react-native';
import {
  AppShell,
  CodeInput,
  InlineAlert,
  LinkButton,
  MockBadge,
  PasswordInput,
  PrimaryButton,
  SecondaryButton,
  formatWait,
  theme,
  useSecondsUntil,
} from '@vuumbora/ui';
import { AuthErrorAlert } from '../../src/components/auth/AuthErrorAlert';
import { AuthHeader } from '../../src/components/auth/AuthHeader';
import { describeAuthError, type AuthErrorAction, type AuthErrorView } from '../../src/identity/authErrors';
import { useAuthFlowStore, type PendingReset } from '../../src/identity/authFlowStore';
import { identity } from '../../src/identity/identityClient';
import { safeCall } from '../../src/identity/safeCall';
import { useRetryLock } from '../../src/identity/useRetryLock';
import { goBackOr } from '../../src/navigation/goBack';
import { useFocusAfterRender, useFocusOnArrival } from '../../src/lib/focusAfterRender';
import { resetSchema, type ResetFormValues } from '../../src/schemas/authSchemas';
import { fieldErrorProps } from '../../src/lib/fieldErrorProps';

const MOCK_CODE_HINT = 'demonstração: código 123456';

type Scope = 'reset' | 'resend';

/**
 * Redefinir a senha: código de 6 dígitos do e-mail + senha NOVA (8 a 72 bytes). Sucesso revoga as sessões de todos
 * os aparelhos (contrato) e leva à entrada com o e-mail preenchido e um aviso — NÃO abre sessão.
 *
 * `reset_locked` (teto de falhas da conta em 24 h): nem o código certo vale e pedir outro não adianta. A tela diz
 * "tente mais tarde ou fale com o suporte", desliga o envio e o reenvio, e NÃO mostra contagem (24 h não ajuda).
 * Também: `invalid_code` + tentativas restantes, `code_locked`/`code_expired` (levam a "Pedir novo código"),
 * `invalid_password` (no campo), `too_many_attempts` (contagem), rede/serviço. O reenvio chama o mesmo
 * "esqueci a senha": o servidor responde igual exista a conta ou não, então o aviso não afirma que o e-mail saiu.
 *
 * Foco: ao abrir, vai ao campo do código. Se o envio falhar, vai ao campo com o erro (código ou senha nova, a mensagem
 * está embaixo dele) ou, quando o erro é um aviso, ao aviso (o botão que enviou ficou indisponível durante o envio e o
 * navegador o jogaria no `<body>`).
 */
export default function RedefinirSenhaScreen() {
  const reset = useAuthFlowStore((state) => state.reset);
  // Mesma regra da tela do código: sem fluxo ao abrir -> volta ao pedido; fluxo que acaba durante a tela -> nada.
  const [hadFlow] = useState(reset !== null);
  if (reset === null) {
    return hadFlow ? null : <Redirect href="/esqueci-senha" />;
  }
  return <ResetForm pending={reset} />;
}

function ResetForm({ pending }: { readonly pending: PendingReset }) {
  const { email } = pending;
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [failure, setFailure] = useState<{ readonly view: AuthErrorView; readonly scope: Scope; readonly attempt: number } | null>(null);
  const [resendNotice, setResendNotice] = useState<number | null>(null);
  const [resetLocked, setResetLocked] = useState(false);
  const lock = useRetryLock();
  const alertRef = useRef<ViewInstance>(null);
  const focusAfterRender = useFocusAfterRender();
  const resendSeconds = useSecondsUntil(pending.nextResendAt);

  const { control, handleSubmit, setError, setFocus } = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { code: '', newPassword: '' },
    mode: 'onBlur',
  });
  useFocusOnArrival(() => setFocus('code'));

  const resetWait = lock.secondsFor('reset');
  const resetBlocked = resetLocked || resetWait > 0;

  function fail(view: AuthErrorView, scope: Scope) {
    if (view.key === 'reset_locked') setResetLocked(true);
    if (view.key === 'too_many_attempts' && view.retryAfterSeconds !== undefined) lock.lockFor(view.retryAfterSeconds, scope);
    setFailure((previous) => ({ view, scope, attempt: (previous?.attempt ?? 0) + 1 }));
    focusAfterRender(() => alertRef.current?.focus());
  }

  async function onSubmit(values: ResetFormValues) {
    if (submitting || resetBlocked) return;
    setFailure(null);
    setResendNotice(null);
    setSubmitting(true);
    const result = await safeCall(() => identity.resetPassword({ email, code: values.code, newPassword: values.newPassword }));
    setSubmitting(false);

    if (result.ok) {
      router.dismissTo('/entrar');
      useAuthFlowStore.getState().finishToLogin(email, 'password_changed');
      return;
    }
    const view = describeAuthError('reset', result.error);
    if (view.presentation === 'field' && view.field === 'newPassword') {
      setError('newPassword', { type: 'server', message: view.message });
      focusAfterRender(() => setFocus('newPassword'));
      return;
    }
    if (view.presentation === 'field' && view.field === 'code' && view.actions.length === 0) {
      // Ainda há tentativas: a mensagem (com o que resta) vai no próprio campo. Esgotadas, vira aviso com "Pedir novo código".
      setError('code', { type: 'server', message: view.message });
      focusAfterRender(() => setFocus('code'));
      return;
    }
    fail(view, 'reset');
  }

  async function onResend() {
    if (resending || resetLocked || resendSeconds > 0 || lock.secondsFor('resend') > 0) return;
    setFailure(null);
    setResendNotice(null);
    setResending(true);
    const result = await safeCall(() => identity.forgotPassword({ email }));
    setResending(false);
    if (!result.ok) {
      fail(describeAuthError('code_request', result.error), 'resend');
      return;
    }
    useAuthFlowStore.getState().markResetResent(result.data.resendAfterSeconds);
    setResendNotice((previous) => (previous ?? 0) + 1);
  }

  function handleAction(action: AuthErrorAction) {
    if (action === 'resend_code') void onResend();
  }

  const submit = handleSubmit(onSubmit);
  const resendWait = lock.secondsFor('resend');
  const resendBlocked = resetLocked || resending || resendSeconds > 0 || resendWait > 0;
  const resendRemaining = resendSeconds > 0 ? resendSeconds : resendWait;
  const waitSuffix = resendRemaining > 0 ? ` em ${formatWait(resendRemaining)}` : '';
  const resendLabel = `Reenviar código${waitSuffix}`;
  const requestLabel = `Pedir novo código${waitSuffix}`;

  return (
    <AppShell scroll testID="redefinir-senha-screen">
      <View style={styles.content}>
        <AuthHeader
          title="Nova senha"
          subtitle={`Se ${email} tiver conta confirmada, enviamos um código de 6 dígitos para esse e-mail. Digite o código e escolha a nova senha.`}
          onBack={() => goBackOr('/esqueci-senha')}
        />

        {identity.mode === 'mock' ? <MockBadge label={MOCK_CODE_HINT} testID="redefinir-mock-hint" /> : null}

        <View style={styles.form}>
          <Controller
            control={control}
            name="code"
            render={({ field, fieldState }) => (
              <CodeInput
                label="Código de 6 dígitos"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                {...(failure?.view.field === 'code' && fieldState.error === undefined ? { error: true } : {})}
                inputRef={field.ref}
                leftAccessory={<Mail size={18} color={theme.role.textMuted} strokeWidth={1.75} />}
                testID="redefinir-code-input"
              />
            )}
          />
          <Controller
            control={control}
            name="newPassword"
            render={({ field, fieldState }) => (
              <PasswordInput
                label="Nova senha"
                helperText="De 8 a 72 caracteres."
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                autoComplete="new-password"
                textContentType="newPassword"
                inputRef={field.ref}
                returnKeyType="go"
                onSubmitEditing={() => void submit()}
                leftAccessory={<Lock size={18} color={theme.role.textMuted} strokeWidth={1.75} />}
                testID="redefinir-password-input"
              />
            )}
          />
        </View>

        <View style={styles.actions}>
          {failure !== null ? (
            <AuthErrorAlert
              key={failure.attempt}
              view={failure.view}
              waitSeconds={lock.secondsFor(failure.scope)}
              actionOverrides={{ resend_code: { label: requestLabel, disabled: resendBlocked } }}
              onAction={handleAction}
              alertRef={alertRef}
              testID="redefinir-alert"
            />
          ) : null}
          {resendNotice !== null ? (
            <InlineAlert
              key={resendNotice}
              tone="info"
              message="Pedimos um novo código. Pode levar alguns instantes para chegar; confira também a caixa de spam."
              testID="redefinir-resend-notice"
            />
          ) : null}
          <PrimaryButton
            label={resetWait > 0 ? `Aguarde ${formatWait(resetWait)}` : 'Salvar nova senha'}
            onPress={() => void submit()}
            loading={submitting}
            disabled={resetBlocked}
            accessibilityLabel={resetWait > 0 ? `Salvar nova senha, disponível em ${formatWait(resetWait)}` : 'Salvar nova senha'}
            testID="redefinir-submit-button"
          />
          <SecondaryButton
            label={resendLabel}
            onPress={() => void onResend()}
            disabled={resendBlocked && !resending}
            loading={resending}
            testID="redefinir-resend-button"
          />
          <LinkButton label="Usar outro e-mail" onPress={() => router.dismissTo('/esqueci-senha')} testID="redefinir-restart-link" />
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
