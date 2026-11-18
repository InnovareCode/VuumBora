import { Reveal } from './Reveal';
import styles from './CommitmentBanner.module.css';

interface CommitmentBannerProps {
  label: string;
  text: string;
}

/**
 * Destaque visual para um compromisso público assumido pelo dono (não mais
 * uma linha de texto no meio dos cartões) — pedido do Atlas em 18/11/2026,
 * depois que o dono confirmou o compromisso de taxa/repasse em
 * `docs/decisoes-do-dono.md`. Borda e selo em amarelo de propósito: é a
 * única exceção da regra "amarelo só em ação" porque isto é o argumento
 * central da seção, não decoração.
 */
export function CommitmentBanner({ label, text }: CommitmentBannerProps) {
  return (
    <Reveal className={styles['banner']}>
      <span className={styles['iconBox']} aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" focusable="false">
          <path
            d="M12 3l7 3v5c0 4.5-3 7.5-7 10-4-2.5-7-5.5-7-10V6l7-3z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div>
        <span className={styles['label']}>{label}</span>
        <p className={styles['text']}>{text}</p>
      </div>
    </Reveal>
  );
}
