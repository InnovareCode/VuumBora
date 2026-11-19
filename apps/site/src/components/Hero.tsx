import { ARTE_HERO } from '@/content/artes';
import { HERO_HONESTY } from '@/content/hero';
import { Container } from './Container';
import { DriverApplicationForm } from './DriverApplicationForm';
import styles from './Hero.module.css';

/**
 * Hero reescrito em 19/11/2026 (correção sobre a correção): o dono pediu
 * explicitamente que a candidatura "vá por cima da arte", flutuando em
 * vidro fosco — não mais foto de um lado e formulário do outro.
 *
 * A foto (`ARTE_HERO`) é fundo `position:absolute` de TODA a seção — cobre
 * tanto o texto de abertura quanto o cartão da candidatura, que sentam na
 * mesma imagem. O véu é só de um lado (horizontal no desktop, onde o texto
 * fica à esquerda; vertical no celular, onde tudo empilha) — nunca a foto
 * inteira escurecida (é o defeito que `docs/auditoria-arte-site.md` C1
 * apontou no cartão antigo).
 *
 * O texto NUNCA fica centralizado verticalmente contra o cartão da
 * candidatura (`align-items: start`, não `center`) — essa troca é a causa
 * raiz, medida na auditoria (C3), de o H1 cair abaixo da dobra quando o
 * formulário é mais alto que a foto. Com `start`, o H1 fica preso perto do
 * topo não importa quão alto o cartão fique.
 */
export function Hero() {
  return (
    <section className={styles['hero']} aria-label="Apresentação do VuumBora">
      {/* <img> dentro de <picture> não dispara @next/next/no-img-element. */}
      <picture>
        <img
          src={ARTE_HERO.foto900}
          srcSet={ARTE_HERO.foto560 ? `${ARTE_HERO.foto560} 560w, ${ARTE_HERO.foto900} 900w` : undefined}
          sizes="100vw"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          decoding="async"
          className={styles['bg']}
          style={ARTE_HERO.objectPosition ? { objectPosition: ARTE_HERO.objectPosition } : undefined}
        />
      </picture>
      <span className={styles['veil']} aria-hidden="true" />

      <Container className={styles['grid']}>
        <div className={styles['intro']}>
          <span className={styles['eyebrow']}>{ARTE_HERO.olho}</span>
          <h1 className={styles['title']}>
            {ARTE_HERO.titulo} <strong className={styles['highlight']}>{ARTE_HERO.tituloDestaque}</strong>
          </h1>
          <p className={styles['support']}>{ARTE_HERO.apoio}</p>
          <div className={styles['ctas']}>
            <a href="#candidatura" className={styles['ctaPrimary']}>
              Candidate-se para dirigir
            </a>
            <a href="#passageiros" className={styles['ctaSecondary']}>
              Sou passageiro
            </a>
          </div>
        </div>

        <div id="candidatura" className={styles['action']}>
          <DriverApplicationForm />
          <p className={styles['honesty']}>{HERO_HONESTY}</p>
        </div>
      </Container>
    </section>
  );
}
