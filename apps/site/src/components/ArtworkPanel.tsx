import type { ElementType } from 'react';
import type { Arte } from '@/content/artes';
import styles from './ArtworkPanel.module.css';

interface ArtworkPanelProps {
  arte: Arte;
  /** Carregamento prioritário — reservado para a arte do Hero (afeta o LCP). */
  priority?: boolean;
  /** Nível do título dentro do bloco de texto. 'h1' só para o Hero — o
   * resto da página usa 'h2' (uma seção por arte). */
  headingLevel?: 'h1' | 'h2';
  className?: string | undefined;
}

/**
 * Uma arte do dono (`src/content/artes.ts`), em duas formas conforme a
 * largura da tela — regra comentada no topo daquele arquivo:
 *   - <768px: o recorte `vertical` (só a foto, sem texto) com os dizeres da
 *     arte sobrepostos em HTML/Poppins, sobre um degradê para legibilidade.
 *     Na arte completa, nesse tamanho, a faixa de texto renderiza com ~7px
 *     de altura — por isso o recorte existe.
 *   - >=768px: a arte `completa`, já com o texto desenhado dentro dela.
 *
 * O bloco de texto nunca sai do DOM: a partir de 768px ele só fica
 * visualmente oculto (mesma técnica de `.visually-hidden` em globals.css),
 * para quem usa leitor de tela continuar recebendo os dizeres mesmo quando
 * a imagem completa (que não expõe esse texto a quem não vê) assume.
 */
export function ArtworkPanel({ arte, priority, headingLevel = 'h2', className }: ArtworkPanelProps) {
  const Heading = headingLevel as ElementType;

  return (
    <figure className={className ? `${styles['panel']} ${className}` : styles['panel']}>
      <picture className={styles['picture']}>
        <source
          media="(min-width: 768px)"
          srcSet={`${arte.completa800} 800w, ${arte.completa} 1600w`}
          sizes="(min-width: 1024px) 60vw, 100vw"
        />
        {/* <img> dentro de <picture> não dispara @next/next/no-img-element. */}
        <img
          src={arte.vertical ?? arte.completa800}
          alt={arte.alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : undefined}
          className={styles['img']}
        />
      </picture>
      <figcaption className={styles['overlay']}>
        <span className={styles['eyebrow']}>{arte.olho}</span>
        <Heading className={styles['title']}>
          {arte.titulo} <strong className={styles['highlight']}>{arte.tituloDestaque}</strong>
        </Heading>
        <p className={styles['support']}>{arte.apoio}</p>
      </figcaption>
    </figure>
  );
}
