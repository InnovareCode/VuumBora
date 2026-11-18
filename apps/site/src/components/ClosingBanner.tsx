import { FINAL_BANNER_CONTENT } from '@/content/finalBanner';
import { AnchorCta } from './AnchorCta';
import { Container } from './Container';
import { Reveal } from './Reveal';
import styles from './ClosingBanner.module.css';

/** Faixa final antes do rodapé (`docs/conteudo-site.md` §7, versão A). */
export function ClosingBanner() {
  return (
    <section className={styles['banner']} aria-labelledby="faixa-final-titulo">
      <Container>
        <Reveal className={styles['inner']}>
          <h2 id="faixa-final-titulo" className={styles['title']}>
            {FINAL_BANNER_CONTENT.title}
          </h2>
          <p className={styles['description']}>{FINAL_BANNER_CONTENT.description}</p>
          <div className={styles['actions']}>
            <AnchorCta href={FINAL_BANNER_CONTENT.primaryCta.href}>{FINAL_BANNER_CONTENT.primaryCta.label}</AnchorCta>
            <AnchorCta href={FINAL_BANNER_CONTENT.secondaryCta.href} variant="secondary">
              {FINAL_BANNER_CONTENT.secondaryCta.label}
            </AnchorCta>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
