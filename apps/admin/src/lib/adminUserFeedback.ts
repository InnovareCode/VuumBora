import { errorMessage, type ApiError } from '../api';
import { twoFactorFeedback, type TwoFactorFeedback } from './twoFactorFeedback';

/**
 * Tradução de erro de API para feedback de tela nos diálogos de usuários/papéis — estende `twoFactorFeedback`
 * (senha/código/espera já cobertos ali) com os `conflict.reason` específicos desta tela
 * (docs/contrato-admin-usuarios.md). `invalid_code` do servidor já chega aqui como `invalid_second_factor`
 * (ver `sendStepUpFailure` em `admin-user-route.ts`), então não precisa de um caso próprio.
 */
export function adminUserFeedback(error: ApiError): TwoFactorFeedback {
  if (error.kind === 'conflict') {
    switch (error.reason) {
      case 'last_owner':
        return { kind: 'error', message: 'Este é o último dono ativo do painel — não é possível desativar ou trocar o papel dele.' };
      case 'concurrent_update':
        return { kind: 'warning', message: 'Outra alteração está em andamento para este usuário. Tente novamente em alguns segundos.' };
      case 'two_factor_not_enrolled':
        return {
          kind: 'error',
          message: 'Sua própria conta ainda não tem a verificação em duas etapas ativa; isto é exigido para esta ação. Ative-a em "Segurança" antes de continuar.',
        };
      default:
        return { kind: 'error', message: errorMessage(error) };
    }
  }
  return twoFactorFeedback(error);
}
