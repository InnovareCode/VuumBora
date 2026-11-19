import styles from './PhoneMockup.module.css';

interface PhoneMockupProps {
  /** Versão de 1120px, para telas a partir de 768px. */
  src1120: string;
  /** Versão de 560px, servida abaixo de 768px — não manda a imagem grande
   * para celular. */
  src560: string;
  alt: string;
  priority?: boolean;
  className?: string | undefined;
}

/**
 * Celular fotografado de verdade (render com estrutura metálica, brilho
 * âmbar e sombra) — substituiu a antiga moldura 100% CSS (`PhoneFrame`,
 * removida do projeto em 19/11/2026 junto com `ParallaxScene`, quando o
 * dono entregou mockup fotográfico de todas as telas). O mockup já traz seu
 * próprio fundo quase preto e seu próprio brilho, por isso nunca leva
 * `filter: drop-shadow` nem crop por cima: é uma imagem única,
 * câmera-pronta, do app em cima do celular, o fundo ao redor dela é quem
 * deve se ajustar (ver `docs/direcao-de-arte` + pedido do dono em
 * 18/11/2026), nunca o contrário.
 *
 * Exportação estática com `images.unoptimized`: por isso `<picture>` com
 * duas larguras já exportadas (1120/560), não `next/image`.
 */
export function PhoneMockup({ src1120, src560, alt, priority, className }: PhoneMockupProps) {
  return (
    <picture className={className ? `${styles['mockup']} ${className}` : styles['mockup']}>
      <source media="(max-width: 767px)" srcSet={src560} />
      {/* <img> dentro de <picture> não dispara @next/next/no-img-element. */}
      <img
        src={src1120}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : undefined}
        className={styles['img']}
      />
    </picture>
  );
}
