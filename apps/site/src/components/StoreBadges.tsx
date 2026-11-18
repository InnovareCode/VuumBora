import { STORE_BADGES_CONTENT } from '@/content/hero';
import { DisabledAction } from './DisabledAction';
import styles from './DisabledAction.module.css';

/** O app ainda não foi publicado em nenhuma loja (ver PENDÊNCIAS do handoff). */
export function StoreBadges() {
  return (
    <div className={styles['group']} role="group" aria-label={STORE_BADGES_CONTENT.groupLabel}>
      {STORE_BADGES_CONTENT.stores.map((store) => (
        <DisabledAction key={store} caption={STORE_BADGES_CONTENT.caption} label={store} />
      ))}
    </div>
  );
}
