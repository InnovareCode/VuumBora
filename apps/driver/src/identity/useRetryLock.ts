import { useCallback, useState } from 'react';
import { useSecondsUntil } from '@vuumbora/ui';

/**
 * Espera imposta pelo SERVIDOR (`retryAfterSeconds` do `too_many_attempts`), com contagem regressiva. A espera vale
 * para uma CHAVE (no login, o identificador digitado: o servidor espera por par identificador+IP, então trocar de
 * e-mail não herda a espera do anterior). O cliente só reflete a espera — quem a faz cumprir é o servidor, que
 * recusa a tentativa antecipada; por isso um relógio errado no aparelho nunca "destrava" nada de verdade.
 */
export function useRetryLock() {
  const [lock, setLock] = useState<{ readonly key: string; readonly until: number } | null>(null);
  const secondsLeft = useSecondsUntil(lock?.until ?? null);

  const lockFor = useCallback((seconds: number, key = '') => {
    setLock({ key, until: Date.now() + Math.max(0, seconds) * 1000 });
  }, []);
  const clear = useCallback(() => setLock(null), []);
  /** Segundos que faltam para a `key` poder tentar de novo (0 = livre). */
  const secondsFor = useCallback((key = '') => (lock !== null && lock.key === key ? secondsLeft : 0), [lock, secondsLeft]);

  return { lockFor, clear, secondsFor };
}
