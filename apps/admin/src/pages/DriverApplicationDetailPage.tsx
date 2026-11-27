import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { useDriverApplicationDetail } from '../hooks/useDriverApplicationDetail';
import { useAuth } from '../context/AuthContext';
import { EmptyState, ErrorState, LoadingState } from '../components/RequestState';
import { StatusPill } from '../components/StatusPill';
import { CopyButton } from '../components/CopyButton';
import { DecisionActions } from '../components/DecisionActions';
import { DecisionRecord } from '../components/DecisionRecord';
import { canDecideDriverApplications } from '../lib/permissions';
import { formatDateTime, formatTristate } from '../lib/format';
import styles from './DriverApplicationDetailPage.module.css';

export function DriverApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { admin } = useAuth();
  const { data, loading, error, reload } = useDriverApplicationDetail(id ?? '');
  // Sobrevive ao `reload()` (que zera `data` por um instante) — se não fosse
  // estado próprio da página, o aviso de conflito desapareceria e voltaria
  // junto com o loading, em vez de ficar visível até a pessoa fechar.
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);

  return (
    <section>
      <Link className={styles['back']} to="/driver-applications">
        ← Voltar para a lista
      </Link>

      {conflictNotice && (
        <div
          role="alert"
          className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-small text-text"
        >
          <span>{conflictNotice}</span>
          <button
            type="button"
            onClick={() => setConflictNotice(null)}
            aria-label="Fechar aviso"
            className="-my-2.5 -mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text-muted outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-info"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Sem dados (carregando, erro, não encontrada) a tela ainda precisa de um título: o `<h1>` com o nome só vem depois. */}
      {!data ? <h1 className="sr-only">Candidatura de motorista</h1> : null}
      {loading ? <LoadingState label="Carregando candidatura…" /> : null}
      {!loading && error ? <ErrorState message={error} onRetry={reload} /> : null}
      {!loading && !error && !data ? <EmptyState title="Candidatura não encontrada" /> : null}

      {!loading && !error && data ? (
        <>
          <div className={styles['header']}>
            <h1 className={styles['name']}>{data.name}</h1>
            <StatusPill status={data.status} />
          </div>
          <p className={styles['meta']}>
            Candidatura recebida em {formatDateTime(data.createdAt)} · origem: {data.source}
          </p>

          {data.status === 'pending' && canDecideDriverApplications(admin?.role) ? (
            <div className="mb-6">
              <DecisionActions
                applicationId={data.id}
                applicantName={data.name}
                onDecided={() => {
                  setConflictNotice(null);
                  void reload();
                }}
                onConflict={() => {
                  setConflictNotice(
                    'Esta candidatura já foi decidida (por você ou por outra pessoa) enquanto a confirmação estava em andamento. A situação atual está abaixo.',
                  );
                  void reload();
                }}
              />
            </div>
          ) : null}

          {data.status !== 'pending' ? (
            <div className="mb-6">
              <DecisionRecord application={data} />
            </div>
          ) : null}

          <div className={styles['card']}>
            <div className={styles['grid']}>
              <div className={styles['field']}>
                <span className={styles['label']}>E-mail</span>
                <CopyButton value={data.email} label="e-mail" />
              </div>
              <div className={styles['field']}>
                <span className={styles['label']}>Telefone</span>
                <CopyButton value={data.phone} label="telefone" />
              </div>
              <div className={styles['field']}>
                <span className={styles['label']}>Cidade</span>
                <span className={styles['value']}>{data.city}</span>
              </div>
              <div className={styles['field']}>
                <span className={styles['label']}>Estado</span>
                <span className={styles['value']}>{data.state}</span>
              </div>
              <div className={styles['field']}>
                <span className={styles['label']}>Já dirige por aplicativo</span>
                <span className={styles['value']}>{formatTristate(data.alreadyDrivesForApp)}</span>
              </div>
              <div className={styles['field']}>
                <span className={styles['label']}>Tem veículo próprio</span>
                <span className={styles['value']}>{formatTristate(data.hasOwnVehicle)}</span>
              </div>
            </div>

            <p className={styles['note']}>
              Esta é a candidatura da etapa 1 (pré-cadastro, pelo site). Documento, veículo detalhado e endereço são
              coletados na etapa 2, dentro do app do motorista, depois da aprovação aqui.
            </p>
          </div>
        </>
      ) : null}
    </section>
  );
}
