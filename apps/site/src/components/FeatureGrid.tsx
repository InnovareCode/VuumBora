import type { CSSProperties } from 'react';
import { Card } from './Card';
import styles from './FeatureGrid.module.css';

export interface FeatureItem {
  title: string;
  description: string;
}

interface FeatureGridProps {
  items: readonly FeatureItem[];
  /** Mostra "1, 2, 3…" no lugar do ícone genérico — usado no passo a passo. */
  numbered?: boolean;
  /** Quantas colunas no desktop largo (padrão 4). */
  columns?: number;
}

export function FeatureGrid({ items, numbered, columns = 4 }: FeatureGridProps) {
  return (
    <div className={styles.grid} style={{ '--columns': columns } as CSSProperties}>
      {items.map((item, index) => (
        <Card key={item.title}>
          <span className={styles.marker} aria-hidden="true">
            {numbered ? index + 1 : '•'}
          </span>
          <h3 className={styles.itemTitle}>{item.title}</h3>
          <p className={styles.itemDescription}>{item.description}</p>
        </Card>
      ))}
    </div>
  );
}
