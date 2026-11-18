'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import styles from './Reveal.module.css';

interface RevealProps {
  children: ReactNode;
  /** Atraso em ms, para escalonar itens de uma lista (docs/movimento.md: até
   * 6 itens com 30ms de atraso entre si; acima disso, todos juntos). */
  delay?: number;
  className?: string | undefined;
}

// SSR não roda useLayoutEffect (o React avisa no console do build estático).
// No cliente, precisa ser layout effect mesmo: só assim o "esconder antes de
// entrar" acontece antes da primeira pintura, sem um flash do conteúdo
// visível e sumindo em seguida.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Entrada "fade + sobe" ao rolar, uma vez só (não re-anima ao sair e voltar
 * à vista — docs/movimento.md: animação de entrada repetida irrita).
 *
 * Progressivo: o atributo `data-hidden` do DOM começa em `false` no HTML
 * (SSR e no-JS mostram o conteúdo normalmente). Só depois de montado — e só
 * se o sistema não pediu movimento reduzido — o efeito marca o elemento como
 * escondido para então revelar quando ele entrar na tela. Mutação direta no
 * DOM via ref, sem `useState`: nenhum re-render do React por Reveal, e nada
 * de "setState dentro de efeito" (regra do projeto, `react-hooks`).
 */
export function Reveal({ children, delay = 0, className }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    node.dataset['hidden'] = 'true';

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            node.dataset['hidden'] = 'false';
            observer.disconnect();
          }
        }
      },
      { threshold: 0.2, rootMargin: '0px 0px -40px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className ? `${styles['reveal']} ${className}` : styles['reveal']}
      data-hidden="false"
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
