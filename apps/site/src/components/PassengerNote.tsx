import { PASSENGER_NOTE } from '@/content/hero';
import { Container } from './Container';
import { Reveal } from './Reveal';
import { WaitlistForm } from './WaitlistForm';
import styles from './PassengerNote.module.css';

/**
 * O passageiro aparece em segundo plano nesta página (pedido do dono,
 * `docs/decisoes-do-dono.md` → "Virada do site"): uma caixa discreta depois
 * da candidatura do motorista, não outra seção do mesmo peso.
 */
export function PassengerNote() {
  return (
    <section className={styles['section']} aria-label="Lista de espera para passageiros">
      <Container>
        <Reveal className={styles['box']}>
          <div className={styles['copy']}>
            <span className={styles['eyebrow']}>{PASSENGER_NOTE.eyebrow}</span>
            <p className={styles['title']}>{PASSENGER_NOTE.title}</p>
            <p className={styles['description']}>{PASSENGER_NOTE.description}</p>
          </div>
          <div className={styles['formWrap']}>
            <WaitlistForm />
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
