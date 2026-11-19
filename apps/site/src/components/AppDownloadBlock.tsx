import { useId } from 'react';
import { APP_DOWNLOAD_CONTENT } from '@/content/appDownload';
import { Reveal } from './Reveal';
import styles from './AppDownloadBlock.module.css';

function GooglePlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 3.2v17.6c0 .4.2.7.6.9l9.9-9.7L4.6 2.3c-.4.2-.6.5-.6.9z" fill="currentColor" />
      <path d="M16.6 13.1l2.9-1.7c.7-.4.7-1.4 0-1.8l-2.9-1.7-2.8 2.6 2.8 2.6z" fill="currentColor" opacity="0.7" />
      <path d="M14.5 10.5L5 20.6c.2.1.5.1.7 0l9.6-5.6-.8-4.5z" fill="currentColor" opacity="0.85" />
      <path d="M14.5 13.5l-9.5-9c.2-.1.5-.1.7 0l9.6 5.6-.8 3.4z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

function AppStoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16.7 12.6c0-2 1.6-2.9 1.7-3-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.4.8-3.1.8-.7 0-1.7-.8-2.8-.7-1.4 0-2.8.8-3.5 2.1-1.5 2.6-.4 6.7 1.1 8.9.7 1 1.5 2.1 2.6 2.1 1.1 0 1.4-.7 2.7-.7 1.3 0 1.5.7 2.7.7 1.1 0 1.9-1 2.6-2 .6-.9.9-1.5 1.4-2.6-3.4-1.3-2.4-4.4-2.4-5z"
        fill="currentColor"
      />
      <path d="M13.9 5.6c.6-.7 1-1.7.9-2.7-.9.1-1.9.6-2.5 1.3-.5.6-1 1.6-.9 2.6 1 .1 1.9-.5 2.5-1.2z" fill="currentColor" />
    </svg>
  );
}

/**
 * Substitui "Quem está por trás" (`AboutBlock`, removido) em 19/11/2026 —
 * pedido do dono: no lugar de dados institucionais (que foram para o
 * rodapé), um bloco de download com os dois botões de loja, desabilitados
 * de verdade. `disabled` nativo já tira o foco e anuncia "desabilitado"
 * para leitor de tela; `aria-disabled` + `aria-describedby` (apontando pro
 * motivo em `comingSoonNote`, SEMPRE visível em texto, nunca só pela cor
 * acinzentada) reforçam isso.
 */
export function AppDownloadBlock() {
  const noteId = useId();

  return (
    <Reveal className={styles['block']}>
      <span className={styles['eyebrow']}>{APP_DOWNLOAD_CONTENT.eyebrow}</span>
      <p className={styles['title']}>{APP_DOWNLOAD_CONTENT.title}</p>
      <p className={styles['description']}>{APP_DOWNLOAD_CONTENT.description}</p>

      <div className={styles['buttons']}>
        <button type="button" className={styles['storeButton']} disabled aria-disabled="true" aria-describedby={noteId}>
          <GooglePlayIcon />
          <span className={styles['storeText']}>
            <span className={styles['storeCaption']}>Disponível em breve na</span>
            <span className={styles['storeName']}>Google Play</span>
          </span>
        </button>
        <button type="button" className={styles['storeButton']} disabled aria-disabled="true" aria-describedby={noteId}>
          <AppStoreIcon />
          <span className={styles['storeText']}>
            <span className={styles['storeCaption']}>Disponível em breve na</span>
            <span className={styles['storeName']}>App Store</span>
          </span>
        </button>
      </div>

      <p id={noteId} className={styles['note']}>
        {APP_DOWNLOAD_CONTENT.comingSoonNote}
      </p>
    </Reveal>
  );
}
