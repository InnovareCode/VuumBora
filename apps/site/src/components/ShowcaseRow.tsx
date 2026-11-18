import type { ReactNode } from 'react';
import { ParallaxScene } from './ParallaxScene';
import { PhoneFrame } from './PhoneFrame';
import { Reveal } from './Reveal';
import styles from './ShowcaseRow.module.css';

interface ShowcaseRowProps {
  tag?: string;
  title: string;
  description: string;
  screen: { src: string; alt: string };
  scene: { src: string; srcSmall: string; alt: string; focusY: string };
  /** Alterna o lado da foto/celular — é o que faz a seção "alternar", não
   * repetir sempre o mesmo layout (ver docs do pedido do dono). */
  reverse?: boolean;
  /** Conteúdo extra abaixo da descrição (ex.: botão desabilitado). */
  children?: ReactNode;
  revealDelay?: number;
}

/**
 * Uma etapa do fluxo do app: cena fotográfica + celular com a tela real por
 * cima, de um lado; título e texto do outro. Usado pela vitrine de telas
 * (JourneyShowcase) e por qualquer outra seção que precise do mesmo
 * tratamento (ex.: DriverSection) — nunca duplicar este layout ali.
 */
export function ShowcaseRow({
  tag,
  title,
  description,
  screen,
  scene,
  reverse,
  children,
  revealDelay = 0,
}: ShowcaseRowProps) {
  return (
    <div className={styles['row']} data-reverse={reverse ? 'true' : 'false'}>
      <Reveal delay={revealDelay} className={styles['visual']}>
        <div className={styles['sceneLayer']}>
          <ParallaxScene {...scene} />
        </div>
        <div className={styles['phoneLayer']}>
          <PhoneFrame src={screen.src} alt={screen.alt} />
        </div>
      </Reveal>
      <Reveal delay={revealDelay + 80} className={styles['text']}>
        {tag ? <span className={styles['tag']}>{tag}</span> : null}
        <h3 className={styles['title']}>{title}</h3>
        <p className={styles['description']}>{description}</p>
        {children}
      </Reveal>
    </div>
  );
}
