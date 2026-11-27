import { memo, useId, useState } from 'react';
import { ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useAdminUsers, type RoleFilter } from '../hooks/useAdminUsers';
import { useAuth } from '../context/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/RequestState';
import { PageHeader } from '../components/PageHeader';
import { FilterTabs, filterTabId } from '../components/FilterTabs';
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
  const idPrefix = useId();
  const panelId = `${idPrefix}-panel`;
  const empty = !loading && !error && items.length === 0;

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
            className="flex min-h-11 items-center gap-2 rounded-pill bg-cta px-5 py-2.5 text-small font-bold text-on-cta outline-none transition-colors hover:bg-cta-pressed focus-visible:ring-2 focus-visible:ring-info"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Criar usuário
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterTabs label="Filtrar por papel" options={TABS} value={role} onChange={setRole} idPrefix={idPrefix} panelId={panelId} />

        {/* O rótulo inteiro é o alvo (44 px de altura), não só a caixinha. */}
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg pr-1 text-small font-medium text-text-secondary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-info">
          <input
            type="checkbox"
            checked={includeDeactivated}
            onChange={(e) => setIncludeDeactivated(e.target.checked)}
            className="h-5 w-5 cursor-pointer accent-cta outline-none"
          />
          Ver desativados
        </label>
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={filterTabId(idPrefix, role)} tabIndex={loading || empty ? 0 : undefined} className="rounded-xxl">
        {loading ? <LoadingState label="Carregando usuários…" /> : null}
        {!loading && error ? <ErrorState message={error} onRetry={reload} /> : null}
        {empty ? <EmptyState title="Nenhum usuário encontrado" hint="Troque o filtro." /> : null}

        {!loading && !error && items.length > 0 ? (
          <>
            {/* Tabela de 768 px para cima; abaixo, cartões (a tabela de seis colunas media 921 px e estourava a página
                a 390 e a 768). `relative` prende o `sr-only` absoluto do cabeçalho a este contêiner. */}
            <div className="relative hidden overflow-x-auto rounded-xxl border border-border bg-surface md:block">
              <table className="w-full text-left text-small">
                <thead>
                  <tr className="border-b border-border text-caption font-bold uppercase tracking-wider text-text-muted">
                    <th scope="col" className="px-4 py-3">
                      Usuário
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Papel e status
                    </th>
                    <th scope="col" className="hidden px-4 py-3 xl:table-cell">
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

            <ul className="space-y-3 md:hidden" aria-label="Usuários do painel">
              {items.map((item) => (
                <Card
                  key={item.id}
                  item={item}
                  isSelf={item.id === admin?.id}
                  onChangeRole={() => setOpen({ kind: 'role', user: item })}
                  onToggleActive={() => setOpen({ kind: 'toggle', user: item })}
                />
              ))}
            </ul>

            {nextCursor ? (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="min-h-11 rounded-pill border border-border px-5 py-2.5 text-small font-bold text-text-secondary outline-none transition-colors hover:border-cta-pressed/40 hover:text-cta-pressed focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMore ? 'Carregando…' : 'Carregar mais'}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

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

interface RowProps {
  readonly item: AdminUserRecord;
  readonly isSelf: boolean;
  readonly onChangeRole: () => void;
  readonly onToggleActive: () => void;
}

const Row = memo(function Row({ item, isSelf, onChangeRole, onToggleActive }: RowProps) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3 align-middle">
        <UserIdentity item={item} isSelf={isSelf} />
      </td>
      <td className="px-4 py-3 align-middle">
        <UserBadges item={item} />
      </td>
      <td className="hidden whitespace-nowrap px-4 py-3 align-middle text-text-secondary xl:table-cell">{formatDateTime(item.createdAt)}</td>
      <td className="px-4 py-3 text-right align-middle">
        <UserActions item={item} onChangeRole={onChangeRole} onToggleActive={onToggleActive} />
      </td>
    </tr>
  );
});

const Card = memo(function Card({ item, isSelf, onChangeRole, onToggleActive }: RowProps) {
  return (
    <li className="rounded-xxl border border-border bg-surface p-4">
      <UserIdentity item={item} isSelf={isSelf} />
      <div className="mt-3">
        <UserBadges item={item} />
      </div>
      <p className="mt-2 text-caption text-text-secondary">Criado em {formatDateTime(item.createdAt)}</p>
      <div className="mt-3 border-t border-border pt-3">
        <UserActions item={item} onChangeRole={onChangeRole} onToggleActive={onToggleActive} stretch />
      </div>
    </li>
  );
});

function UserIdentity({ item, isSelf }: { readonly item: AdminUserRecord; readonly isSelf: boolean }) {
  return (
    <div className="min-w-0">
      <p className="font-semibold text-text">
        {item.name}
        {isSelf && <span className="ml-2 text-caption font-medium text-text-secondary">(você)</span>}
      </p>
      <p className="text-caption text-text-secondary [overflow-wrap:anywhere]">{item.email}</p>
    </div>
  );
}

function UserBadges({ item }: { readonly item: AdminUserRecord }) {
  const active = item.deactivatedAt === null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill bg-cta/10 px-2.5 py-1 text-caption font-bold text-cta-pressed">
        {item.role === 'dono' && <ShieldCheck className="h-3 w-3" aria-hidden="true" />}
        {ROLE_LABEL[item.role]}
      </span>
      {/* "Desativado" era vermelho sobre o vermelho escuro de `danger-fill`; o fundo agora é o vermelho a 15%. */}
      <span
        className={
          active
            ? 'inline-flex items-center rounded-pill bg-success/10 px-2.5 py-1 text-caption font-bold text-success'
            : 'inline-flex items-center rounded-pill bg-danger/15 px-2.5 py-1 text-caption font-bold text-danger'
        }
      >
        {active ? 'Ativo' : 'Desativado'}
      </span>
    </div>
  );
}

function UserActions({
  item,
  onChangeRole,
  onToggleActive,
  stretch = false,
}: {
  readonly item: AdminUserRecord;
  readonly onChangeRole: () => void;
  readonly onToggleActive: () => void;
  /** Nos cartões (celular) os dois botões dividem a largura. */
  readonly stretch?: boolean;
}) {
  const active = item.deactivatedAt === null;
  const size = stretch ? 'min-h-11 flex-1' : 'min-h-11';
  return (
    <div className={stretch ? 'flex gap-2' : 'flex justify-end gap-2'}>
      <button
        type="button"
        onClick={onChangeRole}
        aria-label={`Trocar papel de ${item.name}`}
        className={`${size} whitespace-nowrap rounded-pill border border-border px-4 text-caption font-bold text-text-secondary outline-none transition-colors hover:border-cta-pressed/40 hover:text-cta-pressed focus-visible:ring-2 focus-visible:ring-info`}
      >
        Trocar papel
      </button>
      <button
        type="button"
        onClick={onToggleActive}
        aria-label={`${active ? 'Desativar' : 'Reativar'} ${item.name}`}
        className={
          active
            ? `${size} whitespace-nowrap rounded-pill border border-danger/40 px-4 text-caption font-bold text-danger outline-none transition-colors hover:bg-danger-fill hover:text-white focus-visible:ring-2 focus-visible:ring-info`
            : `${size} whitespace-nowrap rounded-pill border border-border px-4 text-caption font-bold text-text-secondary outline-none transition-colors hover:border-cta-pressed/40 hover:text-cta-pressed focus-visible:ring-2 focus-visible:ring-info`
        }
      >
        {active ? 'Desativar' : 'Reativar'}
      </button>
    </div>
  );
}
