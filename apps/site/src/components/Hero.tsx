import { HERO_CONTENT } from '@/content/hero';
import { Container } from './Container';
import { DriverApplicationForm } from './DriverApplicationForm';
import { HeroScene } from './HeroScene';
import styles from './Hero.module.css';

/**
 * Página única de pré-lançamento (`docs/decisoes-do-dono.md` → "Virada do
 * site", 19/11/2026): um fundo escuro limpo (sem foto cinematográfica —
 * decisão deliberada, pesa menos e deixa a `HeroScene` ser o único foco
 * visual) + a cena animada + a candidatura do motorista, que é a AÇÃO da
 * página, lado a lado com o texto — não um link de âncora para mais
 * embaixo. Em telas estreitas, a ordem de leitura empilha: texto → cena →
 * formulário, tudo ainda no primeiro scroll.
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
            <HeroScene />
            <DriverApplicationForm />
          </div>
        </div>
      </Container>
    </section>
  );
}
