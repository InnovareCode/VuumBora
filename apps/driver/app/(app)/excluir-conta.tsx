import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { ApiError } from '@vuumbora/api-client';
import { AppShell, ConfirmDialog, DangerButton, InlineAlert, PasswordInput, ScreenHeader, theme, textStyle, type TextInputHandle } from '@vuumbora/ui';
import { identity } from '../../src/identity/identityClient';
import { safeCall } from '../../src/identity/safeCall';
import { useFocusAfterRender } from '../../src/lib/focusAfterRender';

interface DeleteErrorView {
  readonly message: string;
  /** `true`: o erro é da SENHA (campo); `false`: aviso geral acima do botão. */
  readonly field: boolean;
}

/**
 * `/excluir-conta` — mesmo fluxo real da P13 do passageiro (`apps/passenger/app/(app)/excluir-
 * conta.tsx`, só para ler — não foi importado nem copiado por cima, é outra zona): reautenticação
 * por senha e `identity.deleteAccount({ password })`
 * (`packages/api-client/src/identity/client.ts:107`), que chama o MESMO endpoint genérico
 * `POST /v1/auth/delete-account` (`apps/api/src/routes/auth-route.ts:209` — serve os dois apps).
 * Um `POST` só, reautenticado por senha, sem fila nem prazo: o texto abaixo não promete nada que
 * o contrato não garante.
 *
 * **`403 wrong_password` NÃO encerra a sessão** (`client.ts:101-106`): conta e sessão continuam
 * intactas, o erro vai no CAMPO da senha. Qualquer outro erro mostra aviso geral.
 *
 * **Sem menção a candidatura/documentos de motorista**: o contrato não diz o que acontece com o
 * cadastro de motorista (que é outra etapa, nem publicada ainda) ao excluir a CONTA — inventar
 * seria mentir. O texto fala só do que `deleteAccount` garante: conta anonimizada, sessões
 * encerradas.
 */
export default function DriverDeleteAccountScreen() {
  const [password, setPassword] = useState('');
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const passwordRef = useRef<TextInputHandle>(null);
  const focusAfterRender = useFocusAfterRender();

  function describeError(error: ApiError): DeleteErrorView {
    if (error.code === 'wrong_password') return { message: 'Senha incorreta.', field: true };
    switch (error.kind) {
      case 'network':
        return { message: 'Sem conexão com a internet. Confira sua rede e tente de novo.', field: false };
      case 'rate_limited':
        return { message: 'Muitas tentativas. Aguarde um pouco antes de tentar de novo.', field: false };
      case 'unavailable':
        return { message: 'O serviço está indisponível no momento. Tente de novo em instantes.', field: false };
      default:
        return { message: 'Algo deu errado. Tente de novo.', field: false };
    }
  }

  async function handleConfirmDelete() {
    if (submitting) return;
    setSubmitting(true);
    setFieldError(null);
    setGeneralError(null);
    const result = await safeCall(() => identity.deleteAccount({ password }));
    if (result.ok) return; // a sessão já foi encerrada (`client.ts:213`); a guarda desmonta esta tela e manda para /entrar
    setSubmitting(false);
    setConfirmVisible(false);
    const view = describeError(result.error);
    if (view.field) {
      setFieldError(view.message);
      focusAfterRender(() => passwordRef.current?.focus());
    } else {
      setGeneralError(view.message);
    }
  }

  const canSubmit = password.length > 0 && !submitting;

  return (
    <AppShell scroll glow testID="delete-account-screen">
      <View style={styles.content}>
        <ScreenHeader title="Excluir conta" onBack={() => router.back()} testID="delete-account-header" />

        <Text style={styles.explanation}>
          Isso é definitivo. Ao confirmar, sua conta é anonimizada e todas as sessões em todos os aparelhos são encerradas
          imediatamente — inclusive esta. Você perde o acesso às suas corridas e aos dados salvos no app.
        </Text>

        {generalError ? <InlineAlert tone="danger" message={generalError} testID="delete-account-general-error" /> : null}

        <PasswordInput
          label="Confirme sua senha"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            if (fieldError) setFieldError(null);
          }}
          disabled={submitting}
          error={fieldError !== null}
          {...(fieldError !== null ? { errorMessage: fieldError } : null)}
          autoComplete="current-password"
          textContentType="password"
          inputRef={passwordRef}
          testID="delete-account-password-input"
        />

        <DangerButton
          label="Excluir conta"
          onPress={() => setConfirmVisible(true)}
          disabled={!canSubmit}
          testID="delete-account-button"
        />
      </View>

      <ConfirmDialog
        visible={confirmVisible}
        title="Excluir conta definitivamente?"
        description="Essa ação não pode ser desfeita."
        confirmLabel="Excluir conta"
        cancelLabel="Cancelar"
        destructive
        loading={submitting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setConfirmVisible(false)}
        testID="delete-account-dialog"
      />
    </AppShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: theme.spacing['4'] },
  explanation: { color: theme.role.textSecondary, ...textStyle('regular', 'small') },
});
