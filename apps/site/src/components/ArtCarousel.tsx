'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { FocusEvent } from 'react';
import type { Arte } from '@/content/artes';
import { ArtCard } from './ArtCard';
import styles from './ArtCarousel.module.css';

interface ArtCarouselProps {
  artes: readonly Arte[];
  ariaLabel: string;
}

const AUTOPLAY_MS = 5500; // pedido do dono: 5-6s, tempo de ler título + apoio.

/**
 * Carrossel das artes informativas — pedido do dono em 19/11/2026 (correção
 * sobre a correção): troca sozinho, "fluido e intuitivo", mas com toda a
 * acessibilidade de verdade que movimento automático exige:
 *
 * - Some com `prefers-reduced-motion: reduce` (desliga de vez, só navegação
 *   manual — nunca inicia o intervalo).
 * - Pausa enquanto o ponteiro ou o foco do teclado estiver dentro da área
 *   (`onPointerEnter/Leave`, `onFocusCapture/BlurCapture`), retoma ao sair.
 * - Pausa com a aba em segundo plano (`document.visibilitychange`), para não
 *   gastar CPU/bateria invisível.
 * - Botão de pausar/retomar sempre visível (não só ao focar) — é o que deixa
 *   alguém parar para ler com calma sem precisar manter o mouse em cima.
 * - `aria-roledescription="carousel"`/`"slide"`, cada slide com rótulo "N de
 *   M: título", região `aria-live="polite"` anunciando a troca.
 * - Funciona SEM JavaScript: a `<ul>` já é `overflow-x:auto` com
 *   `scroll-snap`, puro CSS — os botões de seta/pausa/bolinha e o avanço
 *   automático são tudo camada de cima, adicionada só depois de hidratar.
 *
 * A troca (automática ou manual) chama `track.scrollTo({left, behavior})` —
 * é o próprio `scroll-snap` da `<ul>` que produz o deslize suave entre
 * slides, então não existe um motor de animação próprio para manter.
 */
export function ArtCarousel({ artes, ariaLabel }: ArtCarouselProps) {
  const [index, setIndex] = useState(0);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  // Inicializador preguiçoso (não um `useEffect` + `setState` síncrono) —
  // evita o cascading render que `react-hooks/set-state-in-effect` reprova.
  // `window` não existe no SSR; o padrão do projeto (igual Reveal.tsx) é
  // assumir "movimento permitido" até o cliente provar o contrário.
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  const containerRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLUListElement>(null);
  const statusId = useId();

  const count = artes.length;
  const playing = !reducedMotion && !manuallyPaused && !interactionPaused && !tabHidden;

  // `prefers-reduced-motion`, ao vivo — só assina mudanças; o valor inicial
  // já veio do `useState` acima.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    function handleChange(event: MediaQueryListEvent) {
      setReducedMotion(event.matches);
    }
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  // Aba em segundo plano pausa — não gasta CPU/bateria rodando invisível.
  useEffect(() => {
    function handleVisibility() {
      setTabHidden(document.hidden);
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // O relógio do avanço automático.
  useEffect(() => {
    if (!playing || count <= 1) return;
    const id = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [playing, count]);

  // Rola o track até o slide atual — tanto no avanço automático quanto no
  // clique em seta/bolinha, que só mudam `index`.
  useEffect(() => {
    const track = trackRef.current;
    const slide = track?.children[index];
    if (!track || !(slide instanceof HTMLElement)) return;
    track.scrollTo({ left: slide.offsetLeft, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [index, reducedMotion]);

  function goTo(next: number) {
    setIndex(((next % count) + count) % count);
  }

  function handleBlurCapture(event: FocusEvent) {
    const next = event.relatedTarget as Node | null;
    if (!next || !containerRef.current?.contains(next)) setInteractionPaused(false);
  }

  const current = artes[index];

  return (
    <section
      ref={containerRef}
      className={styles['carousel']}
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      onPointerEnter={() => setInteractionPaused(true)}
      onPointerLeave={() => setInteractionPaused(false)}
      onFocusCapture={() => setInteractionPaused(true)}
      onBlurCapture={handleBlurCapture}
    >
      <p id={statusId} aria-live="polite" className="visually-hidden">
        {current ? `Slide ${index + 1} de ${count}: ${current.titulo} ${current.tituloDestaque}` : null}
      </p>

      <div className={styles['toolbar']}>
        {!reducedMotion && count > 1 ? (
          <button
            type="button"
            className={styles['playToggle']}
            aria-pressed={manuallyPaused}
            onClick={() => setManuallyPaused((value) => !value)}
          >
            {manuallyPaused ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Retomar apresentação
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7 5h4v14H7zm6 0h4v14h-4z" />
                </svg>
                Pausar apresentação
              </>
            )}
          </button>
        ) : null}
      </div>

      <div className={styles['viewport']}>
        <button type="button" className={`${styles['arrow']} ${styles['arrowPrev']}`} onClick={() => goTo(index - 1)} aria-label="Arte anterior">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <ul ref={trackRef} className={styles['track']} tabIndex={0} aria-describedby={statusId}>
          {artes.map((arte, i) => (
            <li
              key={arte.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} de ${count}: ${arte.titulo} ${arte.tituloDestaque}`}
              className={styles['slide']}
            >
              <ArtCard arte={arte} priority={i === 0} />
            </li>
          ))}
        </ul>

        <button type="button" className={`${styles['arrow']} ${styles['arrowNext']}`} onClick={() => goTo(index + 1)} aria-label="Próxima arte">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className={styles['dots']} role="group" aria-label="Ir para uma arte">
        {artes.map((arte, i) => (
          <button
            key={arte.id}
            type="button"
            className={styles['dot']}
            aria-current={index === i}
            aria-label={`Ir para a arte ${i + 1}: ${arte.titulo} ${arte.tituloDestaque}`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>
    </section>
  );
}
