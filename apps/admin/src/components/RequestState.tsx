import styles from './RequestState.module.css';

/**
 * Três pecinhas pequenas e reutilizáveis para os três estados que toda
 * chamada de API pode ter, além do sucesso — carregando, vazio, erro.
 * Nenhuma tela deve tratar isso por conta própria (responsabilidade #2).
 */

export function LoadingState({ label = 'Carregando…' }: { readonly label?: string }) {
  return (
    <div className={`${styles['state']} ${styles['center']}`} role="status" aria-live="polite">
      <span className={styles['spinner']} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint }: { readonly title: string; readonly hint?: string }) {
  return (
    <div className={`${styles['state']} ${styles['center']}`}>
      <span className={styles['title']}>{title}</span>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { readonly message: string; readonly onRetry?: () => void }) {
  return (
    <div className={styles['state']} role="alert">
      <span className={`${styles['title']} ${styles['errorTitle']}`}>Não foi possível carregar</span>
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className={styles['retry']} onClick={onRetry}>
          Tentar de novo
        </button>
      ) : null}
    </div>
  );
}
