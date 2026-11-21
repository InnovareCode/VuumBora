import { useEffect, useState } from 'react';

/**
 * Segundos restantes até `until` (timestamp em ms), com tique de 1 s. `null`
 * ou já passado = 0, e nesse caso nenhum intervalo roda. Calcula a partir do
 * relógio (não decrementando um contador) para não derivar quando a aba fica
 * em segundo plano e o navegador segura os timers.
 */
export function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until == null) return;
    setNow(Date.now());
    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [until]);

  return until == null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}
