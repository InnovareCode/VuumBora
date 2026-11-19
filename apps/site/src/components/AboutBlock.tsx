import { ABOUT_CONTENT } from '@/content/about';
import { Reveal } from './Reveal';
import styles from './AboutBlock.module.css';

/**
 * "Quem está por trás" (`docs/conteudo-site.md` §5) — liberado em
 * 19/11/2026 quando o dono identificou o controlador dos dados. Sem campo
 * de cidade: o dono decidiu não publicá-la, não é uma pendência (ver
 * `src/content/about.ts`) — por isso nenhum espaço reservado aqui.
 */
export function AboutBlock() {
  return (
    <Reveal className={styles['block']}>
      <p className={styles['title']}>{ABOUT_CONTENT.title}</p>
      <p className={styles['text']}>
        O VuumBora é desenvolvido por <strong>{ABOUT_CONTENT.company}</strong>.<br />
        CNPJ {ABOUT_CONTENT.cnpj}
      </p>
      <p className={styles['contact']}>
        Contato: <a href={`mailto:${ABOUT_CONTENT.email}`}>{ABOUT_CONTENT.email}</a>
      </p>
    </Reveal>
  );
}
