import { HERO_CONTENT } from '@/content/hero';
import { AnchorCta } from './AnchorCta';
import { Container } from './Container';
import { PhoneMockup } from './PhoneMockup';
import { Reveal } from './Reveal';
import { StoreBadges } from './StoreBadges';
import styles from './Hero.module.css';

/**
 * Topo cinematográfico: cena noturna do passageiro esperando a corrida, com
 * zoom lento contínuo (Ken Burns, só CSS, desativado sob
 * `prefers-reduced-motion: reduce`) + mockup fotográfico do app flutuando ao
 * lado em telas largas — o primeiro contato já mostra o produto real, não
 * só a promessa em texto.
 *
 * Mostra `home-passageiro` (mapa + categorias de viagem), não
 * `boas-vindas` (tela de login) — decisão de produto de 19/11/2026: mesmo
 * com os dois mockups disponíveis hoje em `public/mockups/`, a tela com
 * mapa e opções de corrida vende o produto melhor no primeiro impacto do
 * que uma tela de entrar/cadastrar. `boas-vindas.jpg` fica disponível no
 * disco para uso futuro, sem lugar fixo no site hoje.
 */
export function Hero() {
  return (
    <section id="topo" className={styles['hero']} aria-label="Apresentação do VuumBora">
      <div className={styles['photoWrap']}>
        <picture>
          <source media="(max-width: 767px)" srcSet="/cenas/passageiro-noite-960.jpg" />
          <img
            src="/cenas/passageiro-noite.jpg"
            alt=""
            className={styles['photo']}
            fetchPriority="high"
            decoding="async"
          />
        </picture>
      </div>
      <div className={styles['scrim']} aria-hidden="true" />
      <Container>
        <div className={styles['layout']}>
          <div className={styles['content']}>
            <span className={styles['eyebrow']}>{HERO_CONTENT.eyebrow}</span>
            <h1 className={styles['title']}>{HERO_CONTENT.title}</h1>
            <p className={styles['subtitle']}>{HERO_CONTENT.subtitle}</p>
            <p className={styles['honesty']}>{HERO_CONTENT.honesty}</p>
            <div className={styles['actions']}>
              <AnchorCta href={HERO_CONTENT.primaryCta.href}>{HERO_CONTENT.primaryCta.label}</AnchorCta>
              <AnchorCta href={HERO_CONTENT.secondaryCta.href} variant="secondary">
                {HERO_CONTENT.secondaryCta.label}
              </AnchorCta>
            </div>
            <div className={styles['stores']}>
              <StoreBadges />
            </div>
          </div>
          <Reveal delay={160} variant="media" className={styles['showcase']}>
            <div aria-hidden="true">
              <PhoneMockup
                src1120="/mockups/home-passageiro.jpg"
                src560="/mockups/home-passageiro-560.jpg"
                alt=""
                className={styles['mockup']}
              />
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
