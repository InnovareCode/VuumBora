import { HERO_CONTENT } from '@/content/hero';
import { AnchorCta } from './AnchorCta';
import { Container } from './Container';
import { PhoneFrame } from './PhoneFrame';
import { StoreBadges } from './StoreBadges';
import styles from './Hero.module.css';

/**
 * Topo cinematográfico: cena noturna do passageiro esperando a corrida, com
 * zoom lento contínuo (Ken Burns, só CSS, desativado sob
 * `prefers-reduced-motion: reduce`) + a tela de boas-vindas do app flutuando
 * ao lado em telas largas — o primeiro contato já mostra o produto real, não
 * só a promessa em texto.
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
          <div className={styles['showcase']} aria-hidden="true">
            <PhoneFrame src="/screens/boas-vindas.jpg" alt="" />
          </div>
        </div>
      </Container>
    </section>
  );
}
