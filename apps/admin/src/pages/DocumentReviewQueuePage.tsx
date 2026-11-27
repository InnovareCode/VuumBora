import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, FileCheck2 } from 'lucide-react';
import { useDocumentReviewQueue } from '../hooks/useDocumentReviewQueue';
import { EmptyState, ErrorState, LoadingState } from '../components/RequestState';
import { PageHeader } from '../components/PageHeader';
import { DocumentStatusPill } from '../components/documents/DocumentStatusPills';
import { formatDateTime } from '../lib/format';
import { formatRelativeHours } from '../lib/documentFormat';
import type { DocumentReviewQueueItem, DriverDocumentStatus } from '../api';

const TABS: ReadonlyArray<{ readonly value: DriverDocumentStatus; readonly label: string; readonly empty: string }> = [
  { value: 'submitted', label: 'Aguardando análise', empty: 'Nenhum documento aguardando análise' },
  { value: 'approved', label: 'Aprovados', empty: 'Nenhum documento aprovado' },
  { value: 'rejected', label: 'Recusados', empty: 'Nenhum documento recusado' },
  { value: 'expired', label: 'Vencidos', empty: 'Nenhum documento vencido' },
];

/**
 * Fila de documentos do motorista (D7) — só `dono` e `revisor_documentos` (o menu e o `AppShell` escondem
 * a rota dos outros; o 403 do servidor é a proteção real, e esta tela também o trata se ele vier).
 *
 * A ordem é a do servidor: mais antigo primeiro. O prazo vencido vem pronto (`overdue`) e aparece em TEXTO
 * ("Prazo vencido"), não só em cor. Nenhuma URL de arquivo passa por aqui: ela só existe no detalhe, no
 * clique de "Ver documento".
 */
export function DocumentReviewQueuePage() {
  const [status, setStatus] = useState<DriverDocumentStatus>('submitted');
  const { items, loading, loadingMore, error, errorKind, nextCursor, reload, loadMore } = useDocumentReviewQueue(status);
  const tab = TABS.find((candidate) => candidate.value === status) ?? TABS[0]!;
  const overdueCount = status === 'submitted' ? items.filter((item) => item.overdue).length : 0;

  return (
    <section>
      <PageHeader
        icon={FileCheck2}
        title="Documentos"
        description="Confira os documentos enviados pelos motoristas, do mais antigo para o mais novo."
        className="mb-6"
      />

      <div role="tablist" aria-label="Filtrar documentos por situação" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((candidate) => (
          <button
            key={candidate.value}
            type="button"
            role="tab"
            aria-selected={status === candidate.value}
            onClick={() => setStatus(candidate.value)}
            className={
              status === candidate.value
                ? 'min-h-11 rounded-pill bg-cta px-4 py-2 text-caption font-bold text-on-cta outline-none focus-visible:ring-2 focus-visible:ring-info'
                : 'min-h-11 rounded-pill border border-border px-4 py-2 text-caption font-semibold text-text-secondary outline-none transition-colors hover:border-cta-pressed/40 hover:text-cta-pressed focus-visible:ring-2 focus-visible:ring-info'
            }
          >
            {candidate.label}
          </button>
        ))}
      </div>

      {!loading && !error && overdueCount > 0 ? (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-small font-semibold text-text">
          <AlarmClock className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          {overdueCount === 1
            ? '1 documento desta lista passou do prazo de análise.'
            : `${overdueCount} documentos desta lista passaram do prazo de análise.`}
        </p>
      ) : null}

      {loading ? <LoadingState label="Carregando documentos…" /> : null}
      {/* 403 não ganha "tentar de novo": papel não muda com retry. */}
      {!loading && error ? <ErrorState message={error} {...(errorKind !== 'forbidden' ? { onRetry: () => void reload() } : {})} /> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title={tab.empty} hint="Troque o filtro para ver outras situações." /> : null}

      {!loading && !error && items.length > 0 ? (
        <>
          <div className="overflow-x-auto rounded-xxl border border-border bg-surface">
            <table className="w-full text-left text-small">
              <caption className="sr-only">
                {tab.label}: documentos do mais antigo para o mais novo
              </caption>
              <thead>
                <tr className="border-b border-border text-caption font-bold uppercase tracking-wider text-text-muted">
                  <th scope="col" className="px-4 py-3">
                    Motorista e documento
                  </th>
                  <th scope="col" className="px-4 py-3">
                    {status === 'submitted' ? 'Prazo da análise' : 'Situação'}
                  </th>
                  <th scope="col" className="hidden px-4 py-3 sm:table-cell">
                    Enviado em
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <QueueRow key={item.documentId} item={item} />
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
                className="min-h-11 rounded-pill border border-border px-5 py-2.5 text-small font-bold text-text-secondary outline-none transition-colors hover:border-cta-pressed/40 hover:text-cta-pressed focus-visible:ring-2 focus-visible:ring-info disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore ? 'Carregando…' : 'Carregar mais'}
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

const QueueRow = memo(function QueueRow({ item }: { readonly item: DocumentReviewQueueItem }) {
  const href = `/document-reviews/drivers/${encodeURIComponent(item.driverId)}?documento=${encodeURIComponent(item.documentId)}`;
  return (
    <tr
      data-overdue={item.overdue || undefined}
      // Destaque do vencido: fundo na linha, faixa à esquerda (na 1ª célula: sombra em <tr> não pinta) e o
      // TEXTO "Prazo vencido" na célula do prazo — nunca só a cor.
      className={item.overdue ? 'border-b border-border bg-danger/5 last:border-0' : 'border-b border-border last:border-0'}
    >
      {/* `pt-1` + link de 44 px (o nome sozinho media 100x21, achado da Íris): o texto fica onde estava. */}
      <td className={item.overdue ? 'px-4 pb-3 pt-1 align-top shadow-[inset_4px_0_0_var(--color-danger)]' : 'px-4 pb-3 pt-1 align-top'}>
        <Link
          to={href}
          className="inline-flex min-h-11 items-center rounded-sm text-body font-semibold text-text underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-info"
        >
          {item.driverName}
        </Link>
        <p className="-mt-2 text-caption text-text-secondary">{item.typeLabel}</p>
      </td>
      <td className="px-4 py-3 align-top">
        {item.status === 'submitted' ? <Deadline item={item} /> : <DocumentStatusPill status={item.status} />}
      </td>
      <td className="hidden px-4 py-3 align-top text-text-secondary sm:table-cell">{formatDateTime(item.submittedAt)}</td>
    </tr>
  );
});

function Deadline({ item }: { readonly item: DocumentReviewQueueItem }) {
  if (item.overdue) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-pill bg-danger-fill px-2.5 py-1 text-caption font-bold text-white">
          <AlarmClock className="h-3.5 w-3.5" aria-hidden="true" />
          Prazo vencido
        </span>
        <span className="text-caption text-text-secondary">
          {formatDateTime(item.reviewDeadline)} ({formatRelativeHours(item.reviewDeadline)})
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-small font-semibold text-text">até {formatDateTime(item.reviewDeadline)}</span>
      <span className="text-caption text-text-secondary">{formatRelativeHours(item.reviewDeadline)}</span>
    </div>
  );
}
