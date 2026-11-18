import styles from './StatusTag.module.css';

export type StatusVariant = 'existing' | 'building' | 'deciding';

interface StatusTagProps {
  variant: StatusVariant;
  label: string;
}

const ICON_PATH: Record<StatusVariant, string> = {
  // check — já existe
  existing: 'M5 12.5l4.2 4.2L19 7',
  // relógio — estamos construindo (em andamento)
  building: 'M12 7v5l3.5 2M12 20a8 8 0 100-16 8 8 0 000 16z',
  // interrogação — ainda vamos decidir
  deciding: 'M9.2 9a2.8 2.8 0 115.2 1.5c-.5.8-1.4 1.1-1.9 1.8-.3.4-.5 1-.5 1.7M12 17.2h.01',
};

/**
 * Rótulo de situação do projeto (já existe / em construção / a decidir) —
 * sempre ícone + texto, nunca só cor (pedido de acessibilidade do
 * Apolo/Atlas em 18/11/2026, `docs/conteudo-site.md` §3 e §5).
 */
export function StatusTag({ variant, label }: StatusTagProps) {
  return (
    <span className={`${styles['tag']} ${styles[variant]}`}>
      <svg
        className={styles['icon']}
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <path d={ICON_PATH[variant]} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </span>
  );
}
