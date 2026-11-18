import type { ReactNode } from 'react';
import { Container } from './Container';
import styles from './Section.module.css';

interface SectionProps {
  id: string;
  headingId: string;
  children: ReactNode;
  tone?: 'base' | 'elevated';
}

/** Landmark <section> com título associado via aria-labelledby (leitor de
 * tela anuncia o nome da seção ao entrar nela pela navegação por landmarks). */
export function Section({ id, headingId, children, tone = 'base' }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={styles.section}
      style={tone === 'elevated' ? { background: 'var(--color-background-surface)' } : undefined}
    >
      <Container>{children}</Container>
    </section>
  );
}
