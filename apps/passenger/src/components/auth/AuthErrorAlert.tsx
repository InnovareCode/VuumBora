import { memo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { InlineAlert, LinkButton, formatWait, tabularNums, theme, textStyle } from '@vuumbora/ui';
import type { AuthErrorAction, AuthErrorView } from '../../identity/authErrors';

const ACTION_LABEL: Record<AuthErrorAction, string> = {
  go_verify: 'Digitar o código',
  go_login: 'Entrar na minha conta',
  go_forgot: 'Esqueci minha senha',
  resend_code: 'Pedir novo código',
  restart_register: 'Refazer o cadastro',
};

/** Troca o texto ou desliga uma ação (ex.: "Pedir novo código" enquanto o reenvio ainda está em espera). */
export type AuthErrorActionOverrides = Partial<Record<AuthErrorAction, { readonly label: string; readonly disabled: boolean }>>;

export interface AuthErrorAlertProps {
  readonly view: AuthErrorView;
  readonly actionOverrides?: AuthErrorActionOverrides;
  /** Segundos que faltam da espera do servidor (só para `too_many_attempts` com `retryAfterSeconds`). */
  readonly waitSeconds?: number;
  readonly onAction?: (action: AuthErrorAction) => void;
  readonly testID?: string;
}

/**
 * Aviso de um erro de conta, com as ações do estado (ex.: `email_taken` -> Entrar / Esqueci minha senha) e a
 * contagem da espera. O texto do aviso é fixo (anunciado UMA vez); a contagem muda a cada segundo mas fica fora da
 * região anunciada — um leitor de tela não pode narrar "8, 7, 6...". Quando a contagem chega a zero, o aviso vira
 * "Você já pode tentar de novo" (esse sim é anunciado). Quem renderiza troca a `key` a cada tentativa, para um erro
 * IGUAL ao anterior ser anunciado de novo.
 */
export const AuthErrorAlert = memo(function AuthErrorAlert({
  view,
  waitSeconds,
  actionOverrides,
  onAction,
  testID,
}: AuthErrorAlertProps) {
  const counting = view.key === 'too_many_attempts' && view.retryAfterSeconds !== undefined;
  const waitOver = counting && (waitSeconds ?? 0) <= 0;

  if (waitOver) {
    return <InlineAlert tone="info" title="Pronto" message="Você já pode tentar de novo." testID={testID} />;
  }

  return (
    <InlineAlert tone={view.tone} message={view.message} title={view.title} testID={testID}>
      {counting ? (
        <Text style={styles.countdown} testID={testID ? `${testID}-countdown` : undefined}>
          Tente de novo em {formatWait(waitSeconds ?? view.retryAfterSeconds ?? 0)}.
        </Text>
      ) : null}
      {view.actions.map((action) => (
        <LinkButton
          key={action}
          label={actionOverrides?.[action]?.label ?? ACTION_LABEL[action]}
          role={action === 'resend_code' ? 'button' : 'link'}
          align="flex-start"
          disabled={actionOverrides?.[action]?.disabled ?? false}
          onPress={() => onAction?.(action)}
          testID={testID ? `${testID}-${action}` : undefined}
        />
      ))}
    </InlineAlert>
  );
});

const styles = StyleSheet.create({
  countdown: { color: theme.role.textPrimary, ...textStyle('semibold', 'small'), ...tabularNums },
});
