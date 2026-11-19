import type { Arte } from '@/content/artes';
import styles from './ArtCard.module.css';

interface ArtCardProps {
  arte: Arte;
  /** Índice dentro do carrossel — só para o `loading`/`fetchPriority` do
   * primeiro slide, que fica visível sem rolar nada. */
  priority?: boolean;
}

/**
 * Cartão BRANCO de borda — a peça do padrão claro que o dono pediu em
 * 19/11/2026 (3ª reescrita): "seção clara (cor de fundo clara) com cards
 * BRANCOS de borda", olhando `VuumBora_Pre_Lancamento_Web/public/site.css`
 * (`.cards article`). Substitui o antigo `PhotoCard` (foto com véu navy +
 * texto por cima) para os cartões informativos: aqui a foto fica limpa, sem
 * véu nenhum, e o texto mora ABAIXO dela, em tinta navy sobre fundo branco —
 * é o que resolve de vez a crítica C1 da auditoria ("o véu apagou as
 * fotos"), porque não existe véu para apagar nada.
 *
 * O destaque amarelo do título (assinatura visual das artes do dono) virou
 * sublinhado amarelo grosso em vez de TEXTO amarelo: o amarelo da marca
 * sobre branco reprova contraste (~1,6:1); a cor do texto continua navy
 * (>12:1) e o amarelo aparece só como sublinhado.
 */
export function ArtCard({ arte, priority = false }: ArtCardProps) {
  const src = arte.foto900 ?? arte.completa800;

  return (
    <figure className={styles['card']}>
      {/* <img> dentro de <picture> não dispara @next/next/no-img-element. */}
      <div className={styles['media']}>
        <picture>
        <img
          src={src}
          srcSet={arte.foto560 ? `${arte.foto560} 560w, ${src} 900w` : undefined}
          sizes="(min-width: 768px) 420px, 82vw"
          alt={arte.alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          style={arte.objectPosition ? { objectPosition: arte.objectPosition } : undefined}
          className={styles['img']}
        />
        </picture>
      </div>
      <figcaption className={styles['body']}>
        <span className={styles['eyebrow']}>{arte.olho}</span>
        <h3 className={styles['title']}>
          {arte.titulo} <span className={styles['highlight']}>{arte.tituloDestaque}</span>
        </h3>
        <p className={styles['support']}>{arte.apoio}</p>
      </figcaption>
    </figure>
  );
}
