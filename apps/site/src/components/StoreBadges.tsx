import { DisabledAction } from './DisabledAction';
import styles from './DisabledAction.module.css';

const STORES = ['Google Play', 'App Store'] as const;

/** O app ainda não foi publicado em nenhuma loja (ver PENDÊNCIAS do handoff). */
export function StoreBadges() {
  return (
    <div className={styles['group']} role="group" aria-label="Disponibilidade nas lojas de aplicativo">
      {STORES.map((store) => (
        <DisabledAction key={store} caption="Em breve na" label={store} />
      ))}
    </div>
  );
}
