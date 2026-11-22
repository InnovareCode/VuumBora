import { memo, useState } from 'react';
import { ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useAdminUsers, type RoleFilter } from '../hooks/useAdminUsers';
import { useAuth } from '../context/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/RequestState';
import { PageHeader } from '../components/PageHeader';
import { ROLE_LABEL } from '../lib/roleLabel';
import { formatDateTime } from '../lib/format';
import { CreateUserDialog } from '../components/users/CreateUserDialog';
import { ChangeRoleDialog } from '../components/users/ChangeRoleDialog';
import { ToggleActiveDialog } from '../components/users/ToggleActiveDialog';
import type { AdminUserRecord } from '../api';

const TABS: ReadonlyArray<{ readonly value: RoleFilter; readonly label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'dono', label: ROLE_LABEL.dono },
  { value: 'operacao', label: ROLE_LABEL.operacao },
  { value: 'revisor_documentos', label: ROLE_LABEL.revisor_documentos },
  { value: 'financeiro', label: ROLE_LABEL.financeiro },
  { value: 'suporte', label: ROLE_LABEL.suporte },
];

type OpenDialog = { readonly kind: 'create' } | { readonly kind: 'role'; readonly user: AdminUserRecord } | { readonly kind: 'toggle'; readonly user: AdminUserRecord };

/**
 * Usuários e papéis do painel — só `dono` (menu e `AppShell` já escondem a
 * rota para os outros; o 403 do servidor é a proteção real). Lista com
 * filtro de papel + "ver desativados" e paginação por cursor, igual
 * `DriverApplicationsListPage`. Nenhuma ação otimista: a linha só muda
 * depois que `reload()` confirma com o servidor.
 */
export function UsersPage() {
  const { admin } = useAuth();
  const [role, setRole] = useState<RoleFilter>('all');
  const [includeDeactivated, setIncludeDeactivated] = useState(false);
  const { items, loading, loadingMore, error, nextCursor, reload, loadMore } = useAdminUsers(role, includeDeactivated);
  const [open, setOpen] = useState<OpenDialog | null>(null);

  return (
    <section>
      <PageHeader
        icon={Users}
        title="Usuários"
        description="Contas do painel administrativo e os papéis de cada uma."
        className="mb-6"
        actions={
          <button
            type="button"
            onClick={() => setOpen({ kind: 'create' })}
            className="flex items-center gap-2 rounded-pill bg-cta px-5 py-2.5 text-small font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Criar usuário
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filtrar por papel" className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={role === tab.value}
              onClick={() => setRole(tab.value)}
              className={
                role === tab.value
                  ? 'rounded-pill bg-cta px-4 py-2 text-caption font-bold text-on-cta'
                  : 'rounded-pill border border-border px-4 py-2 text-caption font-semibold text-text-secondary outline-none transition-colors hover:border-cta-pressed/40 hover:text-cta-pressed focus-visible:ring-2 focus-visible:ring-info'
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-small font-medium text-text-secondary">
          <input
            type="checkbox"
            checked={includeDeactivated}
            onChange={(e) => setIncludeDeactivated(e.target.checked)}
            className="h-4 w-4 cursor-pointer accent-cta outline-none focus-visible:ring-2 focus-visible:ring-info"
          />
          Ver desativados
        </label>
      </div>

      {loading ? <LoadingState label="Carregando usuários…" /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="Nenhum usuário encontrado" hint="Troque o filtro." /> : null}

      {!loading && !error && items.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-xxl border border-border bg-surface">
            <table className="w-full text-left text-small">
              <thead>
                <tr className="border-b border-border text-caption font-bold uppercase tracking-wider text-text-muted">
                  <th scope="col" className="px-4 py-3">
                    Nome
                  </th>
                  <th scope="col" className="px-4 py-3">
                    E-mail
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Papel
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Criado em
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <Row
                    key={item.id}
                    item={item}
                    isSelf={item.id === admin?.id}
                    onChangeRole={() => setOpen({ kind: 'role', user: item })}
                    onToggleActive={() => setOpen({ kind: 'toggle', user: item })}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {nextCursor ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="rounded-pill border border-border px-5 py-2.5 text-small font-bold text-text-secondary outline-none transition-colors hover:border-cta-pressed/40 hover:text-cta-pressed focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? 'Carregando…' : 'Carregar mais'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}

      {open?.kind === 'create' && (
        <CreateUserDialog
          onClose={() => setOpen(null)}
          onCreated={() => {
            setOpen(null);
            void reload();
          }}
        />
      )}
      {open?.kind === 'role' && (
        <ChangeRoleDialog
          user={open.user}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setOpen(null);
            void reload();
          }}
        />
      )}
      {open?.kind === 'toggle' && (
        <ToggleActiveDialog
          mode={open.user.deactivatedAt === null ? 'deactivate' : 'reactivate'}
          user={open.user}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setOpen(null);
            void reload();
          }}
        />
      )}
    </section>
  );
}

const Row = memo(function Row({
  item,
  isSelf,
  onChangeRole,
  onToggleActive,
}: {
  readonly item: AdminUserRecord;
  readonly isSelf: boolean;
  readonly onChangeRole: () => void;
  readonly onToggleActive: () => void;
}) {
  const active = item.deactivatedAt === null;
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3 font-semibold text-text">
        {item.name}
        {isSelf && <span className="ml-2 text-caption font-medium text-text-muted">(você)</span>}
      </td>
      <td className="px-4 py-3 text-text-secondary">{item.email}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 rounded-pill bg-cta/10 px-2.5 py-1 text-caption font-bold text-cta-pressed">
          {item.role === 'dono' && <ShieldCheck className="h-3 w-3" aria-hidden="true" />}
          {ROLE_LABEL[item.role]}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={
            active
              ? 'inline-flex items-center rounded-pill bg-success/10 px-2.5 py-1 text-caption font-bold text-success'
              : 'inline-flex items-center rounded-pill bg-danger-fill px-2.5 py-1 text-caption font-bold text-danger'
          }
        >
          {active ? 'Ativo' : 'Desativado'}
        </span>
      </td>
      <td className="px-4 py-3 text-text-muted">{formatDateTime(item.createdAt)}</td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onChangeRole}
            className="rounded-pill border border-border px-3 py-1.5 text-caption font-bold text-text-secondary outline-none transition-colors hover:border-cta-pressed/40 hover:text-cta-pressed focus-visible:ring-2 focus-visible:ring-info"
          >
            Trocar papel
          </button>
          <button
            type="button"
            onClick={onToggleActive}
            className={
              active
                ? 'rounded-pill border border-danger/40 px-3 py-1.5 text-caption font-bold text-danger outline-none transition-colors hover:bg-danger-fill hover:text-white focus-visible:ring-2 focus-visible:ring-info'
                : 'rounded-pill border border-border px-3 py-1.5 text-caption font-bold text-text-secondary outline-none transition-colors hover:border-cta-pressed/40 hover:text-cta-pressed focus-visible:ring-2 focus-visible:ring-info'
            }
          >
            {active ? 'Desativar' : 'Reativar'}
          </button>
        </div>
      </td>
    </tr>
  );
});
