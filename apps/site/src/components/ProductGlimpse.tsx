import { PhoneMockup } from './PhoneMockup';
import { Reveal } from './Reveal';
import styles from './ProductGlimpse.module.css';

/**
 * Prova de que o produto já existe, de verdade (pedido do dono: reaproveitar
 * `public/mockups/`) — uma tela só, do painel de ganhos do motorista, perto
 * do compromisso de taxa/repasse. Nada de carrossel aqui: a página é
 * minimalista de propósito, isto é reforço, não uma segunda seção.
 */
export function ProductGlimpse() {
  return (
    <Reveal variant="media" className={styles['row']}>
      <PhoneMockup
        src1120="/mockups/motorista-ganhos.jpg"
        src560="/mockups/motorista-ganhos-560.jpg"
        alt="Painel do motorista no VuumBora, mostrando ganhos do dia e uma corrida chegando para aceitar"
        className={styles['mockup']}
      />
      <p className={styles['caption']}>
        Tela real do app em construção. Nomes, valores e corridas são de exemplo.
      </p>
    </Reveal>
  );
}
