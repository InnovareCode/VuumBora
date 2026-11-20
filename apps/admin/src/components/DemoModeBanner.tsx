import styles from './DemoModeBanner.module.css';

/**
 * Marca TODA a tela como demonstração enquanto `VITE_API_MODE=mock` — nunca
 * silencioso (regra do briefing). Visível em toda página, não só uma vez.
 */
export function DemoModeBanner() {
  return (
    <div className={styles['banner']} role="status">
      <span className={styles['glyph']} aria-hidden="true">
        !
      </span>
      <span>Modo demonstração — dados fictícios. A API de admin ainda não está no ar.</span>
    </div>
  );
}
