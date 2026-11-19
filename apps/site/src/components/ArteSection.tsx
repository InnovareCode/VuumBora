import type { ReactNode } from 'react';
import type { Arte } from '@/content/artes';
import { ArtworkPanel } from './ArtworkPanel';
import { Container } from './Container';
import { Reveal } from './Reveal';
import styles from './ArteSection.module.css';

interface ArteSectionProps {
  arte: Arte;
  /** Conteúdo extra abaixo da arte — hoje só o `CommitmentBanner` na seção
   * "repasse-rapido" (ver page.tsx). */
  children?: ReactNode;
}

/** Uma seção de página por arte de `ARTES_SECOES` — ver `ArtworkPanel` para
 * como o texto de cada arte chega em tela conforme o breakpoint. */
export function ArteSection({ arte, children }: ArteSectionProps) {
  return (
    <section className={styles['section']} aria-label={`${arte.titulo} ${arte.tituloDestaque}`}>
      <Container>
        <Reveal variant="media">
          <ArtworkPanel arte={arte} />
        </Reveal>
        {children}
      </Container>
    </section>
  );
}
