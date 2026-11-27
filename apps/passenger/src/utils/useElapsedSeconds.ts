import { useEffect, useState } from 'react';

/**
 * Segundos passados desde que `active` ficou `true` (P07 "há 0:42", P08 "Aguardando você há
 * {m:ss}") — conta local, de exibição; nunca é a fonte da verdade do estado da corrida (essa
 * é sempre o `phase`/evento do servidor). Reinicia em 0 sempre que `active` volta a `true`
 * depois de ter sido `false`.
 */
export function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const startedAt = Date.now();
    setSeconds(0);
    const interval = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [active]);

  return seconds;
}
