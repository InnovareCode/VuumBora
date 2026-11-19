import { HERO_CONTENT } from '@/content/hero';
import { Container } from './Container';
import { DriverApplicationForm } from './DriverApplicationForm';
import styles from './Hero.module.css';

/**
 * Página única de pré-lançamento (`docs/decisoes-do-dono.md` → "Virada do
 * site"): foto noturna de cidade costeira com ponte iluminada no fundo, o
 * texto, e a candidatura do motorista — que é a AÇÃO da página — lado a lado,
 * não um link de âncora para mais embaixo.
 *
 * A `HeroScene` (pino 3D sobre rota que se desenha) saiu daqui em 19/11/2026,
 * quando a foto entrou. Não por ser ruim: por competir. A rota âmbar de 4px
 * caía exatamente em cima dos rastros de luz âmbar da avenida na foto e
 * sumia — medido no navegador, a rota continuava desenhada e visível no DOM e
 * mesmo assim não se lia na tela. Dois elementos da mesma cor disputando o
 * mesmo lugar: a foto mostra a cidade melhor do que o mapa desenhado sugeria.
 * O componente continua no projeto, sem uso, caso o fundo mude.
 */
export function Hero() {
  return (
    <section id="topo" className={styles['hero']} aria-label="Apresentação do VuumBora">
      <Container>
        <div className={styles['layout']}>
          <div className={styles['pitch']}>
            <span className={styles['eyebrow']}>{HERO_CONTENT.eyebrow}</span>
            <h1 className={styles['title']}>{HERO_CONTENT.title}</h1>
            <p className={styles['subtitle']}>{HERO_CONTENT.subtitle}</p>
            <p className={styles['honesty']}>{HERO_CONTENT.honesty}</p>
          </div>
          <div className={styles['action']}>
            <DriverApplicationForm />
          </div>
        </div>
      </Container>
    </section>
  );
}
