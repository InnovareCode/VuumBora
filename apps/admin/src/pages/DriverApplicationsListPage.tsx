import { memo, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Search, UserCheck } from 'lucide-react';
import { useDriverApplications, type StatusFilter } from '../hooks/useDriverApplications';
import { useDriverApplicationsSummary } from '../hooks/useDriverApplicationsSummary';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { EmptyState, ErrorState, LoadingState } from '../components/RequestState';
import { StatusPill } from '../components/StatusPill';
import { PageHeader } from '../components/PageHeader';
import { FilterTabs, filterTabId, type FilterTabOption } from '../components/FilterTabs';
import { formatDate, formatTristate } from '../lib/format';
import type { DriverApplication } from '../api';

const TABS: ReadonlyArray<{ readonly value: StatusFilter; readonly label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'approved', label: 'Aprovadas' },
  { value: 'rejected', label: 'Reprovadas' },
];

/**
 * Lista de candidaturas (A02). Responsiva sem rolagem lateral: a 390 px a tabela fica com "Candidato" e "Status" — cidade
 * e data descem para a linha de apoio sob o nome; de 640 px para cima voltam a ser colunas. O perfil (já dirige / veículo
 * próprio) mora sob o nome em todas as larguras: como coluna própria ele empurrava a tabela para 661 px a 390.
 */
export function DriverApplicationsListPage() {
  const [status, setStatus] = useState<StatusFilter>('pending');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const summary = useDriverApplicationsSummary();
  const { items, loading, loadingMore, error, nextCursor, reload, loadMore } = useDriverApplications(status, debouncedSearch);
  const idPrefix = useId();
  const panelId = `${idPrefix}-panel`;

  const countFor = (value: StatusFilter): number | null => {
    if (!summary) return null;
    if (value === 'all') return summary.pending + summary.approved + summary.rejected;
    return summary[value];
  };
  const tabs: ReadonlyArray<FilterTabOption<StatusFilter>> = TABS.map((tab) => ({ ...tab, count: countFor(tab.value) }));
  const empty = !loading && !error && items.length === 0;

  return (
    <section>
      {/* Mesmo ícone do item "Pré-cadastro" no menu (nav/adminNav.ts) — o
          cabeçalho confirma onde a pessoa está. */}
      <PageHeader
        icon={UserCheck}
        title="Pré-cadastro de motorista"
        description="Avalie, aprove ou reprove as candidaturas recebidas pelo site."
        className="mb-6"
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <FilterTabs label="Filtrar por status" options={tabs} value={status} onChange={setStatus} idPrefix={idPrefix} panelId={panelId} />

        <div className="relative w-full sm:max-w-sm sm:flex-1">
          <label className="sr-only" htmlFor="driver-application-search">
            Buscar por nome, e-mail, telefone ou cidade
          </label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          <input
            id="driver-application-search"
            type="search"
            placeholder="Buscar por nome, e-mail, telefone ou cidade…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 w-full text-ellipsis rounded-xl border border-border-control bg-input pl-11 pr-4 text-body text-text outline-none transition-colors placeholder:text-text-muted focus:border-cta-pressed focus-visible:ring-2 focus-visible:ring-info"
          />
        </div>
      </div>

      {/* Painel das abas: só o resultado do filtro. Sem nada focável dentro (carregando/vazio/erro sem botão), ele
          mesmo entra no Tab — padrão WAI-ARIA, para quem troca de aba alcançar o conteúdo. */}
      <div role="tabpanel" id={panelId} aria-labelledby={filterTabId(idPrefix, status)} tabIndex={loading || empty ? 0 : undefined} className="rounded-xxl">
        {loading ? <LoadingState label="Carregando candidaturas…" /> : null}
        {!loading && error ? <ErrorState message={error} onRetry={reload} /> : null}
        {empty ? <EmptyState title="Nenhuma candidatura encontrada" hint="Troque o filtro ou a busca." /> : null}

        {!loading && !error && items.length > 0 ? (
          <>
            {/* `relative`: o conteúdo `sr-only` (absoluto) fica preso a este contêiner, não à página. */}
            <div className="relative overflow-x-auto rounded-xxl border border-border bg-surface">
              <table className="w-full text-left text-small">
                <thead>
                  <tr className="border-b border-border text-caption font-bold uppercase tracking-wider text-text-muted">
                    <th scope="col" className="px-4 py-3">
                      Candidato
                    </th>
                    <th scope="col" className="hidden px-4 py-3 sm:table-cell">
                      Cidade/UF
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                    <th scope="col" className="hidden px-4 py-3 sm:table-cell">
                      Candidatura em
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <Row key={item.id} item={item} />
                  ))}
                </tbody>
              </table>
            </div>

            {nextCursor ? (
              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="min-h-11 rounded-pill border border-border-control px-5 py-2.5 text-small font-bold text-text outline-none transition-colors hover:border-cta-pressed/40 hover:text-cta-pressed focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMore ? 'Carregando…' : 'Carregar mais'}
                </button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}

const Row = memo(function Row({ item }: { readonly item: DriverApplication }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 pb-3 pt-1 align-top">
        {/* 44 px de alvo: o nome sozinho media 21 px de altura. */}
        <Link
          className="inline-flex min-h-11 items-center rounded-sm text-body font-semibold text-text underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-info"
          to={`/driver-applications/${item.id}`}
        >
          {item.name}
        </Link>
        {/* Abaixo de 640 px cidade e data saem das colunas e vêm para cá. */}
        <p className="-mt-1.5 text-caption text-text-secondary sm:hidden">
          {item.city}/{item.state} · {formatDate(item.createdAt)}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <ProfileChip yes={item.alreadyDrivesForApp === true}>Já dirige: {formatTristate(item.alreadyDrivesForApp)}</ProfileChip>
          <ProfileChip yes={item.hasOwnVehicle === true}>Veículo próprio: {formatTristate(item.hasOwnVehicle)}</ProfileChip>
        </div>
      </td>
      {/* `pt-1` + caixa de 44 px: o texto das outras colunas alinha com o nome (que é um alvo de 44 px). */}
      <td className="hidden px-4 pb-3 pt-1 align-top text-text-secondary sm:table-cell">
        <span className="inline-flex min-h-11 items-center">
          {item.city}/{item.state}
        </span>
      </td>
      <td className="px-4 pb-3 pt-1 align-top">
        <span className="inline-flex min-h-11 items-center">
          <StatusPill status={item.status} />
        </span>
      </td>
      <td className="hidden whitespace-nowrap px-4 pb-3 pt-1 align-top text-text-secondary sm:table-cell">
        <span className="inline-flex min-h-11 items-center">{formatDate(item.createdAt)}</span>
      </td>
    </tr>
  );
});

function ProfileChip({ yes, children }: { readonly yes: boolean; readonly children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-sm bg-elevated px-2 py-1 text-caption ${yes ? 'text-success' : 'text-text-secondary'}`}>
      {children}
    </span>
  );
}
