import { PhoneFrame } from './PhoneFrame';
import { Reveal } from './Reveal';
import styles from './ScreensStrip.module.css';

interface Screen {
  src: string;
  alt: string;
}

interface ScreensStripProps {
  screens: readonly Screen[];
  legend: string;
}

/**
 * Faixa de telas reais do app em molduras de celular — carrossel por
 * rolagem horizontal em telas estreitas (nunca encolhe até ficar
 * ilegível), lado a lado sem rolagem a partir de 900px.
 */
export function ScreensStrip({ screens, legend }: ScreensStripProps) {
  return (
    <>
      <div className={styles['strip']}>
        {screens.map((screen, index) => (
          <Reveal key={screen.src} delay={Math.min(index, 5) * 70} className={styles['item']}>
            <PhoneFrame src={screen.src} alt={screen.alt} />
          </Reveal>
        ))}
      </div>
      <p className={styles['legend']}>{legend}</p>
    </>
  );
}
