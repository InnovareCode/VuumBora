import type { CSSProperties } from 'react';
import { Card } from './Card';
import { Reveal } from './Reveal';
import { StatusTag } from './StatusTag';
import type { StatusVariant } from './StatusTag';
import styles from './FeatureGrid.module.css';

export interface FeatureItem {
  title: string;
  description: string;
  /** Texto curto acima do título (ex.: a "dor" que o cartão responde).
   * Quando presente, substitui o marcador numerado/bullet — o próprio
   * kicker já faz esse papel visual. */
  kicker?: string;
  /** Selo de situação do projeto, abaixo do texto (ver StatusTag). */
  status?: { variant: StatusVariant; label: string };
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
    <div className={styles['grid']} style={{ '--columns': columns } as CSSProperties}>
      {items.map((item, index) => (
        // docs/movimento.md: itens de lista entram escalonados até o 6º;
        // daí em diante, juntos — para não deixar o último item "esperando".
        <Reveal key={item.title} delay={Math.min(index, 5) * 70}>
          <Card>
            {item.kicker ? (
              <span className={styles['kicker']}>{item.kicker}</span>
            ) : (
              <span className={styles['marker']} aria-hidden="true">
                {numbered ? index + 1 : '•'}
              </span>
            )}
            <h3 className={styles['itemTitle']}>{item.title}</h3>
            <p className={styles['itemDescription']}>{item.description}</p>
            {item.status ? (
              <div className={styles['statusRow']}>
                <StatusTag variant={item.status.variant} label={item.status.label} />
              </div>
            ) : null}
          </Card>
        </Reveal>
      ))}
    </div>
  );
}
