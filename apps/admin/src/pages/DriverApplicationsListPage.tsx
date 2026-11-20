import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserCheck } from 'lucide-react';
import { useDriverApplications, type StatusFilter } from '../hooks/useDriverApplications';
import { useDriverApplicationsSummary } from '../hooks/useDriverApplicationsSummary';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { EmptyState, ErrorState, LoadingState } from '../components/RequestState';
import { StatusPill } from '../components/StatusPill';
import { PageHeader } from '../components/PageHeader';
import { formatDate, formatTristate } from '../lib/format';
import type { DriverApplication } from '../api';
import styles from './DriverApplicationsListPage.module.css';

const TABS: ReadonlyArray<{ readonly value: StatusFilter; readonly label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'approved', label: 'Aprovadas' },
  { value: 'rejected', label: 'Reprovadas' },
];

export function DriverApplicationsListPage() {
  const [status, setStatus] = useState<StatusFilter>('pending');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const summary = useDriverApplicationsSummary();
  const { items, loading, loadingMore, error, nextCursor, reload, loadMore } = useDriverApplications(status, debouncedSearch);

  const countFor = (value: StatusFilter): number | null => {
    if (!summary) return null;
    if (value === 'all') return summary.pending + summary.approved + summary.rejected;
    return summary[value];
  };

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

      <div className={styles['toolbar']}>
        <div className={styles['tabs']} role="tablist" aria-label="Filtrar por status">
          {TABS.map((tab) => {
            const count = countFor(tab.value);
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-pressed={status === tab.value}
                aria-selected={status === tab.value}
                className={styles['tab']}
                onClick={() => setStatus(tab.value)}
              >
                {tab.label}
                {count !== null ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>

        <div className={styles['search']}>
          <label className="sr-only" htmlFor="driver-application-search">
            Buscar por nome, e-mail, telefone ou cidade
          </label>
          <input
            id="driver-application-search"
            className={styles['searchInput']}
            type="search"
            placeholder="Buscar por nome, e-mail, telefone ou cidade…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? <LoadingState label="Carregando candidaturas…" /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && items.length === 0 ? (
        <EmptyState title="Nenhuma candidatura encontrada" hint="Troque o filtro ou a busca." />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <>
          <div className={styles['tableWrap']}>
            <table className={styles['table']}>
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">Cidade/UF</th>
                  <th scope="col">Perfil</th>
                  <th scope="col">Status</th>
                  <th scope="col">Candidatura em</th>
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
            <div className={styles['loadMore']}>
              <button type="button" className={styles['loadMoreButton']} onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'Carregando…' : 'Carregar mais'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

const Row = memo(function Row({ item }: { readonly item: DriverApplication }) {
  return (
    <tr>
      <td>
        <Link className={styles['nameLink']} to={`/driver-applications/${item.id}`}>
          {item.name}
        </Link>
      </td>
      <td className={styles['muted']}>
        {item.city}/{item.state}
      </td>
      <td>
        <div className={styles['chips']}>
          <span className={`${styles['chip']} ${item.alreadyDrivesForApp ? styles['chipYes'] : ''}`}>
            Já dirige: {formatTristate(item.alreadyDrivesForApp)}
          </span>
          <span className={`${styles['chip']} ${item.hasOwnVehicle ? styles['chipYes'] : ''}`}>
            Veículo próprio: {formatTristate(item.hasOwnVehicle)}
          </span>
        </div>
      </td>
      <td>
        <StatusPill status={item.status} />
      </td>
      <td className={styles['muted']}>{formatDate(item.createdAt)}</td>
    </tr>
  );
});
