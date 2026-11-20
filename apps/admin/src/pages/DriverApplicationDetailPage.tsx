import { Link, useParams } from 'react-router-dom';
import { useDriverApplicationDetail } from '../hooks/useDriverApplicationDetail';
import { EmptyState, ErrorState, LoadingState } from '../components/RequestState';
import { StatusPill } from '../components/StatusPill';
import { CopyButton } from '../components/CopyButton';
import { formatDateTime, formatTristate } from '../lib/format';
import styles from './DriverApplicationDetailPage.module.css';

export function DriverApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useDriverApplicationDetail(id ?? '');

  return (
    <section>
      <Link className={styles['back']} to="/driver-applications">
        ← Voltar para a lista
      </Link>

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
