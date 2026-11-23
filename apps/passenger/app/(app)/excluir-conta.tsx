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
 * `/excluir-conta` — tela de explicação + reautenticação + confirmação (ficha P13 §2.2: "toque
 * → tela de explicação → `ConfirmDialog destructive` → `POST /v1/me/deletion`"). O contrato
 * REAL (`identity.deleteAccount`, `packages/api-client/src/identity/client.ts:107`) é mais
 * simples do que a ficha supunha: um `POST` só, reautenticado por SENHA, sem fila nem
 * `scheduledFor` (a ficha imaginava um pedido assíncrono com prazo — não existe; a exclusão é
 * imediata) e sem checagem de corrida ativa no contrato (o `409 active_trip_exists` da ficha
 * também não existe). Por isso o texto abaixo não promete um prazo que o servidor não devolve.
 *
 * **`403 wrong_password` NÃO encerra a sessão** (`client.ts:101-106`): conta e sessão continuam
 * intactas, o erro vai no CAMPO da senha, e a pessoa pode tentar de novo. Qualquer outro erro
 * mostra aviso geral, sem tocar no campo.
 */
export default function DeleteAccountScreen() {
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
    if (result.ok) return; // a sessão já foi encerrada (`client.ts:213`); a guarda desmonta esta tela
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
          imediatamente — inclusive esta. Você perde o acesso ao histórico de viagens e aos dados salvos no app.
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
