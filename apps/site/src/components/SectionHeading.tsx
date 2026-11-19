import type { ElementType } from 'react';
import styles from './SectionHeading.module.css';

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  id?: string;
  level?: 'h2' | 'h3';
  className?: string;
}

/**
 * Título de seção (pílula + H2) — pequeno e reutilizável, para não repetir a
 * mesma marcação de eyebrow+heading em cada seção nova da página.
 * `font-size` fica bem abaixo da metade do H1 do Hero (auditoria C2: "H1 ≥
 * 2× qualquer H2") de propósito.
 */
export function SectionHeading({ eyebrow, title, id, level = 'h2', className }: SectionHeadingProps) {
  const Heading = level as ElementType;
  return (
    <div className={className ? `${styles['wrap']} ${className}` : styles['wrap']}>
      <span className={styles['eyebrow']}>{eyebrow}</span>
      <Heading id={id} className={styles['title']}>
        {title}
      </Heading>
    </div>
  );
}
