'use client';

import { useEffect, useRef } from 'react';
import styles from './ParallaxScene.module.css';

interface ParallaxSceneProps {
  src: string;
  srcSmall: string;
  alt: string;
  focusY: string;
  className?: string | undefined;
}

/**
 * Cena fotográfica com paralaxe discreta: a imagem se desloca um pouco mais
 * devagar que a rolagem, dentro de um recorte que não deixa aparecer borda
 * vazia. `<picture>` troca para a versão menor em telas estreitas (nunca
 * manda a versão 1920 para celular).
 *
 * Desativado sob `prefers-reduced-motion: reduce` e também fica parado se o
 * JS não rodar — a imagem sempre aparece centralizada e cobrindo o recorte
 * mesmo sem nenhum deslocamento.
 */
export function ParallaxScene({ src, srcSmall, alt, focusY, className }: ParallaxSceneProps) {
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const img = imgRef.current;
    const wrap = img?.parentElement?.parentElement;
    if (!img || !wrap) return;

    let ticking = false;
    const update = () => {
      ticking = false;
      const rect = wrap.getBoundingClientRect();
      const total = window.innerHeight + rect.height;
      const progress = Math.min(1, Math.max(0, (window.innerHeight - rect.top) / total));
      const offset = (progress - 0.5) * 36; // px, deslocamento discreto
      img.style.transform = `translateY(${offset.toFixed(1)}px)`;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div className={className ? `${styles['wrap']} ${className}` : styles['wrap']}>
      <div className={styles['clip']}>
        <picture>
          <source media="(max-width: 767px)" srcSet={srcSmall} />
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            className={styles['img']}
            style={{ objectPosition: `50% ${focusY}` }}
          />
        </picture>
      </div>
      <div className={styles['scrim']} aria-hidden="true" />
    </div>
  );
}
