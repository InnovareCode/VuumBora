import { FINAL_BANNER_CONTENT } from '@/content/finalBanner';
import { AnchorCta } from './AnchorCta';
import { Container } from './Container';
import { Reveal } from './Reveal';
import { WaitlistForm } from './WaitlistForm';
import styles from './ClosingBanner.module.css';

/**
 * Faixa final antes do rodapé (`docs/conteudo-site.md` §7). O formulário da
 * lista de espera é o CTA principal; os links de navegação continuam
 * abaixo, para quem preferir só rever uma seção.
 */
export function ClosingBanner() {
  return (
    <section className={styles['banner']} aria-labelledby="faixa-final-titulo">
      <Container>
        <Reveal className={styles['inner']}>
          <h2 id="faixa-final-titulo" className={styles['title']}>
            {FINAL_BANNER_CONTENT.title}
          </h2>
          <p className={styles['description']}>{FINAL_BANNER_CONTENT.description}</p>
          <div className={styles['formWrap']}>
            <WaitlistForm />
          </div>
          <div className={styles['actions']}>
            <AnchorCta href={FINAL_BANNER_CONTENT.primaryCta.href} variant="secondary">
              {FINAL_BANNER_CONTENT.primaryCta.label}
            </AnchorCta>
            <AnchorCta href={FINAL_BANNER_CONTENT.secondaryCta.href} variant="secondary">
              {FINAL_BANNER_CONTENT.secondaryCta.label}
            </AnchorCta>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
