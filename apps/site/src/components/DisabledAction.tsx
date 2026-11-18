import styles from './DisabledAction.module.css';

interface DisabledActionProps {
  caption: string;
  label: string;
  showIcon?: boolean;
}

/**
 * Ação "ainda não existe" em todo o site (loja de app, cadastro de
 * motorista). `<button disabled>` de verdade, nunca um link para "#" ou para
 * uma página vazia — o leitor de tela anuncia "desabilitado" em vez de
 * sugerir uma ação que não leva a lugar nenhum.
 */
export function DisabledAction({ caption, label, showIcon = true }: DisabledActionProps) {
  return (
    <button type="button" disabled aria-disabled="true" className={styles['badge']}>
      {showIcon ? (
        <svg
          className={styles['icon']}
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          focusable="false"
        >
          <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ) : null}
      <span className={styles['labels']}>
        <span className={styles['caption']}>{caption}</span>
        <span className={styles['label']}>{label}</span>
      </span>
    </button>
  );
}
