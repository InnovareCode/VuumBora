import { ARTE_HERO } from '@/content/artes';
import { HERO_HONESTY } from '@/content/hero';
import { ArtworkPanel } from './ArtworkPanel';
import { Container } from './Container';
import { DriverApplicationForm } from './DriverApplicationForm';
import styles from './Hero.module.css';

/**
 * Página única de pré-lançamento (`docs/decisoes-do-dono.md` → "Virada do
 * site"): a arte `ARTE_HERO` (dirija com a VuumBora, Ponta Negra) ao lado da
 * candidatura de motorista — que é a AÇÃO da página, nunca um link de âncora
 * para mais embaixo.
 *
 * Reescrito em 19/11/2026 para usar as artes reais do dono em vez da foto
 * gerada que ele recusou — `ArtworkPanel` cuida de mostrar a arte completa a
 * partir de 768px e o recorte vertical + texto em HTML abaixo disso.
 *
 * A arte fica FORA do `Container`, ocupando a largura inteira, e a candidatura
 * vem logo abaixo. A primeira tentativa colocou as duas lado a lado e foi
 * medida a 1440px: a arte caía para 564x317 (39% da tela), sobravam 444px de
 * vazio sob ela porque o cartão de candidatura tem 761px de altura, e o título
 * desenhado na arte encolhia para 220px de largura. Essas artes foram
 * compostas como banner largo; espremidas numa coluna, perdem exatamente o
 * impacto pelo qual foram feitas.
 */
export function Hero() {
  return (
    <section id="topo" className={styles['hero']} aria-label="Apresentação do VuumBora">
      <ArtworkPanel arte={ARTE_HERO} priority headingLevel="h1" className={styles['art']} />
      <Container>
        <div className={styles['action']}>
          <DriverApplicationForm />
          <p className={styles['honesty']}>{HERO_HONESTY}</p>
        </div>
      </Container>
    </section>
  );
}
