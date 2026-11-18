import { Reveal } from './Reveal';
import { StatusTag } from './StatusTag';
import type { StatusVariant } from './StatusTag';
import styles from './CredibilityColumns.module.css';

export interface CredibilityColumn {
  variant: StatusVariant;
  label: string;
  items: readonly string[];
}

/** As três colunas de estado do projeto (`docs/conteudo-site.md` §5) — o
 * rótulo de cada coluna é sempre ícone + texto (StatusTag), nunca só cor. */
export function CredibilityColumns({ columns }: { columns: readonly CredibilityColumn[] }) {
  return (
    <div className={styles['grid']}>
      {columns.map((column, index) => (
        <Reveal key={column.label} delay={Math.min(index, 5) * 80}>
          <div className={styles['column']}>
            <StatusTag variant={column.variant} label={column.label} />
            <ul className={styles['list']}>
              {column.items.map((item) => (
                <li key={item} className={styles['item']}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      ))}
    </div>
  );
}
