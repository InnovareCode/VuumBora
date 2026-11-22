import { useApi } from '../../context/ApiContext';
import type { AdminUserRecord } from '../../api';
import { ROLE_LABEL } from '../../lib/roleLabel';
import { ActorPasswordDialog } from './ActorPasswordDialog';

/**
 * Desativar (nunca pede o código — contrato) ou reativar (código só quando o
 * ALVO já é `dono`) um usuário. `onClose` some com senha/código; sucesso
 * dispara `onChanged`, que recarrega a lista com o estado atual do servidor
 * (sem otimismo — a linha só muda depois da confirmação real).
 */
export function ToggleActiveDialog({
  mode,
  user,
  onClose,
  onChanged,
}: {
  readonly mode: 'deactivate' | 'reactivate';
  readonly user: AdminUserRecord;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const api = useApi();

  if (mode === 'deactivate') {
    return (
      <ActorPasswordDialog
        title={`Desativar — ${user.name}`}
        intro={
          <>
            <strong className="font-bold text-text">{user.name}</strong> perde o acesso ao painel na hora — qualquer sessão aberta
            dessa conta é encerrada. Você pode reativar depois, quando quiser.
          </>
        }
        submitLabel="Desativar"
        pendingLabel="Desativando…"
        danger
        requireCode={false}
        onClose={onClose}
        run={({ password }) => api.adminUsers.deactivate(user.id, password)}
        onDone={onChanged}
      />
    );
  }

  const requireCode = user.role === 'dono';
  return (
    <ActorPasswordDialog
      title={`Reativar — ${user.name}`}
      intro={
        <>
          <strong className="font-bold text-text">{user.name}</strong> volta a poder entrar no painel com o papel atual (
          {ROLE_LABEL[user.role]}).
        </>
      }
      submitLabel="Reativar"
      pendingLabel="Reativando…"
      requireCode={requireCode}
      onClose={onClose}
      run={(stepUp) => api.adminUsers.reactivate(user.id, stepUp)}
      onDone={onChanged}
    />
  );
}
