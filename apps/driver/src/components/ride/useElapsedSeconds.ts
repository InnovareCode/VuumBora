import { useEffect, useState } from 'react';

const TICK_MS = 1000;

/**
 * Segundos decorridos desde `sinceMs` (instante do servidor, ex.: quando o motorista chegou ao
 * embarque) — o inverso de `useSecondsUntil` (`@vuumbora/ui`): aqui a contagem SOBE, nunca desce.
 * Mesmo princípio: o relógio de parede é a fonte, não um contador que recomeça do zero ao reabrir
 * o app.
 */
export function useElapsedSeconds(sinceMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [sinceMs]);

  return Math.max(0, Math.floor((now - sinceMs) / 1000));
}
