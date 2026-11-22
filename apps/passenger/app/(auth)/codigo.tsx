import { useRef, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { StyleSheet, View } from 'react-native';
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
  type TextInputHandle,
} from '@vuumbora/ui';
import { AuthErrorAlert } from '../../src/components/auth/AuthErrorAlert';
import { AuthHeader } from '../../src/components/auth/AuthHeader';
import { describeAuthError, type AuthErrorAction, type AuthErrorView } from '../../src/identity/authErrors';
import { useAuthFlowStore, type PendingVerification } from '../../src/identity/authFlowStore';
import { identity } from '../../src/identity/identityClient';
import { safeCall } from '../../src/identity/safeCall';
import { useRetryLock } from '../../src/identity/useRetryLock';
import { goBackOr } from '../../src/navigation/goBack';
import { verifySchema, type VerifyFormValues } from '../../src/schemas/authSchemas';
import { fieldErrorProps } from '../../src/lib/fieldErrorProps';

/** O código de e-mail do ADAPTADOR MOCK (`@vuumbora/api-client`): só aparece enquanto `identity.mode === 'mock'`. */
const MOCK_CODE_HINT = 'demonstração: código 123456';

type Scope = 'verify' | 'resend';

/**
 * Tela do código: o código de 6 dígitos do e-mail + a SENHA escolhida no cadastro (o servidor exige as duas, I-4b:
 * quem só digita o código nunca verifica uma conta cujo cadastro outra pessoa sobrescreveu). O contrato manda pedir a
 * senha de novo; ela nunca viaja pela URL nem pelo `authFlowStore`.
 *
 * Depois de verificar, o servidor NÃO abre sessão: o app chama o login com a mesma senha. Se esse login falhar, a
 * pessoa vai ao login com o e-mail preenchido e um aviso (nada se perde: o e-mail já está confirmado).
 *
 * Estados: `email_not_verified` (chegada pelo login), `emailSent:false` (o e-mail não saiu: reenvio liberado de
 * imediato), `invalid_code` + tentativas restantes, `code_locked`, `code_expired`, `too_many_attempts` com contagem,
 * rede/serviço. Reenvio com contador (60 s, vindo do servidor); o contador é um instante, sobrevive a sair da tela.
 */
export default function CodigoScreen() {
  const verification = useAuthFlowStore((state) => state.verification);
  // Sem fluxo ao ABRIR a tela (URL direta, recarregou o web): não há para quem confirmar -> login.
  // Fluxo que acaba DURANTE a tela (login concluído, indo para o login): renderiza nada, a navegação já está em curso.
  const [hadFlow] = useState(verification !== null);
  if (verification === null) {
    return hadFlow ? null : <Redirect href="/login" />;
  }
  return <VerifyForm verification={verification} />;
}

function VerifyForm({ verification }: { readonly verification: PendingVerification }) {
  const { identifier } = verification;
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [failure, setFailure] = useState<{ readonly view: AuthErrorView; readonly scope: Scope; readonly attempt: number } | null>(null);
  const [resendNotice, setResendNotice] = useState<number | null>(null);
  const lock = useRetryLock();
  const passwordRef = useRef<TextInputHandle>(null);
  const resendSeconds = useSecondsUntil(verification.nextResendAt);

  const { control, handleSubmit } = useForm<VerifyFormValues>({
    resolver: zodResolver(verifySchema),
    defaultValues: { code: '', password: '' },
    mode: 'onBlur',
  });

  const verifyWait = lock.secondsFor('verify');
  const verifyLocked = verifyWait > 0;

  function fail(view: AuthErrorView, scope: Scope) {
    if (view.key === 'too_many_attempts' && view.retryAfterSeconds !== undefined) lock.lockFor(view.retryAfterSeconds, scope);
    setFailure((previous) => ({ view, scope, attempt: (previous?.attempt ?? 0) + 1 }));
  }

  async function onSubmit(values: VerifyFormValues) {
    if (submitting || verifyLocked) return;
    setFailure(null);
    setResendNotice(null);
    setSubmitting(true);

    const verified = await safeCall(() => identity.verifyEmail({ identifier, code: values.code, password: values.password }));
    if (!verified.ok) {
      setSubmitting(false);
      fail(describeAuthError('verify', verified.error), 'verify');
      return;
    }

    const session = await safeCall(() => identity.login({ identifier, password: values.password }));
    if (session.ok) return; // sessão aberta: a guarda leva à Home e desmonta esta tela.
    setSubmitting(false);

    // E-mail confirmado, mas o login não passou agora (rede, espera): segue ao login com o campo preenchido.
    router.dismissTo('/login');
    useAuthFlowStore.getState().finishToLogin(identifier, 'email_confirmed');
  }

  async function onResend() {
    if (resending || resendSeconds > 0 || lock.secondsFor('resend') > 0) return;
    setFailure(null);
    setResendNotice(null);
    setResending(true);
    const result = await safeCall(() => identity.resendVerification({ identifier }));
    setResending(false);
    if (!result.ok) {
      fail(describeAuthError('code_request', result.error), 'resend');
      return;
    }
    useAuthFlowStore.getState().markVerificationResent(result.data.resendAfterSeconds);
    // O servidor responde igual exista a conta ou não, e só envia se couber no intervalo: não afirmamos "enviamos".
    setResendNotice((previous) => (previous ?? 0) + 1);
  }

  function handleAction(action: AuthErrorAction) {
    if (action === 'resend_code') void onResend();
    if (action === 'restart_register') router.dismissTo('/cadastro');
  }

  const submit = handleSubmit(onSubmit);
  const target = identifier.includes('@') ? identifier : 'o e-mail da sua conta';
  const resendWait = lock.secondsFor('resend');
  const resendBlocked = resending || resendSeconds > 0 || resendWait > 0;
  const resendRemaining = resendSeconds > 0 ? resendSeconds : resendWait;
  const waitSuffix = resendRemaining > 0 ? ` em ${formatWait(resendRemaining)}` : '';
  const resendLabel = `Reenviar código${waitSuffix}`;
  const requestLabel = `Pedir novo código${waitSuffix}`;

  return (
    <AppShell scroll testID="codigo-screen">
      <View style={styles.content}>
        <AuthHeader
          title="Confirme seu e-mail"
          subtitle={`Enviamos um código de 6 dígitos para ${target}. Digite o código e a senha que você escolheu no cadastro.`}
          onBack={() => goBackOr('/login')}
        />

        {verification.origin === 'login' ? (
          <InlineAlert
            tone="warning"
            title="E-mail ainda não confirmado"
            message="Para entrar, falta confirmar seu e-mail. Se o código não chegou ou expirou, peça outro abaixo."
            testID="codigo-from-login-notice"
          />
        ) : null}
        {!verification.emailSent ? (
          <InlineAlert
            tone="warning"
            title="O e-mail não saiu"
            message="Sua conta foi criada, mas não conseguimos enviar o e-mail com o código agora. Toque em Reenviar código."
            testID="codigo-email-not-sent"
          />
        ) : null}
        {identity.mode === 'mock' ? <MockBadge label={MOCK_CODE_HINT} testID="codigo-mock-hint" /> : null}

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
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                leftAccessory={<Mail size={18} color={theme.role.textMuted} strokeWidth={1.75} />}
                testID="codigo-code-input"
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field, fieldState }) => (
              <PasswordInput
                label="Senha escolhida no cadastro"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                disabled={submitting}
                {...fieldErrorProps(fieldState.error)}
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                inputRef={passwordRef}
                onSubmitEditing={() => void submit()}
                leftAccessory={<Lock size={18} color={theme.role.textMuted} strokeWidth={1.75} />}
                testID="codigo-password-input"
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
              testID="codigo-alert"
            />
          ) : null}
          {resendNotice !== null ? (
            <InlineAlert
              key={resendNotice}
              tone="info"
              message="Pedimos um novo código. Pode levar alguns instantes para chegar; confira também a caixa de spam."
              testID="codigo-resend-notice"
            />
          ) : null}
          <PrimaryButton
            label={verifyLocked ? `Aguarde ${formatWait(verifyWait)}` : 'Confirmar e entrar'}
            onPress={() => void submit()}
            loading={submitting}
            disabled={verifyLocked}
            accessibilityLabel={verifyLocked ? `Confirmar, disponível em ${formatWait(verifyWait)}` : 'Confirmar e entrar'}
            testID="codigo-submit-button"
          />
          <SecondaryButton
            label={resendLabel}
            onPress={() => void onResend()}
            disabled={resendBlocked && !resending}
            loading={resending}
            testID="codigo-resend-button"
          />
          <LinkButton label="Usar outro e-mail" onPress={() => router.dismissTo('/cadastro')} testID="codigo-restart-link" />
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
