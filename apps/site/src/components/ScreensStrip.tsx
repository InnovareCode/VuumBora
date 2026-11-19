import { PhoneMockup } from './PhoneMockup';
import { Reveal } from './Reveal';
import styles from './ScreensStrip.module.css';

interface Screen {
  src1120: string;
  src560: string;
  alt: string;
}

interface ScreensStripProps {
  screens: readonly Screen[];
  legend: string;
}

/**
 * Faixa de celulares fotografados de verdade — carrossel por rolagem
 * horizontal em telas estreitas (nunca encolhe até ficar ilegível), lado a
 * lado sem rolagem a partir de 900px. Todos os itens usam o mesmo
 * tratamento (mockup fotográfico) de propósito: misturar mockup com moldura
 * CSS na mesma fileira lado a lado ficaria inconsistente (ver
 * `src/content/credibility.ts`).
 */
export function ScreensStrip({ screens, legend }: ScreensStripProps) {
  return (
    <>
      <div className={styles['strip']}>
        {screens.map((screen, index) => (
          <Reveal key={screen.src1120} delay={Math.min(index, 5) * 70} variant="media" className={styles['item']}>
            <PhoneMockup src1120={screen.src1120} src560={screen.src560} alt={screen.alt} className={styles['mockup']} />
          </Reveal>
        ))}
      </div>
      <p className={styles['legend']}>{legend}</p>
    </>
  );
}
