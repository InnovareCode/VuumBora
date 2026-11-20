import { Link } from 'react-router-dom';
import { EmptyState } from '../components/RequestState';
import styles from './NotFoundPage.module.css';

export function NotFoundPage() {
  return (
    <section>
      <EmptyState title="Página não encontrada" hint="Verifique o endereço ou volte para o início." />
      <Link className={styles['link']} to="/driver-applications">
        Ir para pré-cadastro de motorista
      </Link>
    </section>
  );
}
