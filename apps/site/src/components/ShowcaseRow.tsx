import type { ReactNode } from 'react';
import { PhoneMockup } from './PhoneMockup';
import { Reveal } from './Reveal';
import styles from './ShowcaseRow.module.css';

export interface ShowcaseVisual {
  src1120: string;
  src560: string;
  alt: string;
}

export interface ShowcaseRowProps {
  tag?: string;
  title: string;
  description: string;
  visual: ShowcaseVisual;
  /** Alterna o lado da foto/celular — é o que faz a seção "alternar", não
   * repetir sempre o mesmo layout (ver docs do pedido do dono). */
  reverse?: boolean;
  /** Conteúdo extra abaixo da descrição (ex.: botão desabilitado). */
  children?: ReactNode;
  revealDelay?: number;
}

/**
 * Uma etapa do fluxo do app: mockup fotográfico do celular de um lado;
 * título e texto do outro, cada bloco entrando em sequência (imagem, depois
 * título, depois texto — nunca tudo junto, `docs/movimento.md`). Usado pela
 * vitrine de telas (JourneyShowcase) e por qualquer outra seção que precise
 * do mesmo tratamento (ex.: DriverSection) — nunca duplicar este layout ali.
 *
 * Desde 19/11/2026 todas as telas do site têm mockup fotográfico (ver
 * `public/mockups/`) — por isso não existe mais variante "moldura CSS +
 * cena de fundo" aqui (era `PhoneFrame`/`ParallaxScene`, removidos do
 * projeto; ver histórico se precisar do padrão antigo de novo).
 */
export function ShowcaseRow({ tag, title, description, visual, reverse, children, revealDelay = 0 }: ShowcaseRowProps) {
  return (
    <div className={styles['row']} data-reverse={reverse ? 'true' : 'false'}>
      <Reveal delay={revealDelay} variant="media" className={styles['visual']}>
        <PhoneMockup src1120={visual.src1120} src560={visual.src560} alt={visual.alt} className={styles['mockup']} />
      </Reveal>
      <div className={styles['text']}>
        <Reveal delay={revealDelay + 120}>
          {tag ? <span className={styles['tag']}>{tag}</span> : null}
          <h3 className={styles['title']}>{title}</h3>
        </Reveal>
        <Reveal delay={revealDelay + 220}>
          <p className={styles['description']}>{description}</p>
          {children}
        </Reveal>
      </div>
    </div>
  );
}
