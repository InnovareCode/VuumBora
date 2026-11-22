import { useId, useState } from 'react';
import { useApi } from '../../context/ApiContext';
import type { AdminRole, AdminUserRecord } from '../../api';
import { roleRequiresSecondFactorGate } from '../../lib/permissions';
import { ROLE_LABEL } from '../../lib/roleLabel';
import { Dialog } from '../Dialog';
import { ActorPasswordFields } from './ActorPasswordFields';
import { RoleSelect } from './RoleSelect';

/**
 * Trocar o papel de um usuário. O código do TOTP de quem está chamando só é
 * pedido quando o papel NOVO é `dono`/`financeiro` (promoção) — rebaixar
 * sempre é só senha (contrato). Idempotente no servidor: escolher o mesmo
 * papel atual devolve sucesso sem derrubar sessão nem pedir o segundo fator
 * — por isso, nesse caso, a tela nem mostra os campos de reautenticação.
 */
export function ChangeRoleDialog({
  user,
  onClose,
  onChanged,
}: {
  readonly user: AdminUserRecord;
  readonly onClose: () => void;
  readonly onChanged: () => void;
}) {
  const api = useApi();
  const titleId = useId();
  const roleId = useId();
  const [role, setRole] = useState<AdminRole>(user.role);
  const [busy, setBusy] = useState(false);

  const sameRole = role === user.role;
  const requireCode = !sameRole && roleRequiresSecondFactorGate(role);

  return (
    <Dialog titleId={titleId} title={`Trocar papel — ${user.name}`} onClose={onClose} busy={busy}>
      <div className="mb-4 space-y-1.5">
        <p className="text-small text-text-secondary">
          Papel atual: <strong className="font-bold text-text">{ROLE_LABEL[user.role]}</strong>
        </p>
        <RoleSelect id={roleId} value={role} onChange={setRole} />
      </div>

      {sameRole ? (
        <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 items-center justify-center rounded-xl border border-border-control text-small font-bold text-text outline-none transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-info sm:flex-1"
          >
            Fechar
          </button>
        </div>
      ) : (
        <ActorPasswordFields
          key={role}
          intro={
            <>
              Confirme com a sua conta para mudar o papel de <strong className="font-bold text-text">{user.name}</strong> para{' '}
              <strong className="font-bold text-text">{ROLE_LABEL[role]}</strong>. Toda troca aplicada encerra as sessões abertas
              dessa conta.
            </>
          }
          requireCode={requireCode}
          submitLabel="Trocar papel"
          pendingLabel="Trocando…"
          onClose={onClose}
          run={(stepUp) => api.adminUsers.changeRole(user.id, role, stepUp)}
          onDone={onChanged}
          onBusyChange={setBusy}
        />
      )}
    </Dialog>
  );
}
