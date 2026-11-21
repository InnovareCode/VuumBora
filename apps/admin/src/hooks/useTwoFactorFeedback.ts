import { useCallback, useEffect, useState } from 'react';
import type { ApiError } from '../api';
import { twoFactorFeedback, type CodeMethod, type TwoFactorFeedback } from '../lib/twoFactorFeedback';
import { useCountdown } from './useCountdown';

/**
 * Estado de feedback de UM formulário de autenticação (erro, aviso e espera
 * com contagem). Local ao formulário de propósito — nada disto é compartilhado.
 * `locked` desabilita SÓ o envio, e só até a contagem acabar: durante a espera
 * (`account_locked`, 1 s a 15 min por par e-mail + IP) ou o bloqueio do código
 * (`two_factor_locked`, 15 min) nem o dado certo entra (contrato), então deixar o
 * botão ativo só convida a mais 429. Os campos continuam editáveis.
 */
export function useTwoFactorFeedback() {
  const [feedback, setFeedback] = useState<TwoFactorFeedback | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const remaining = useCountdown(lockedUntil);
  const locked = remaining > 0;

  // A espera/bloqueio acabou: o aviso deixou de ser verdade — some, e o envio volta a valer.
  useEffect(() => {
    if (lockedUntil != null && remaining === 0) {
      setFeedback(null);
      setLockedUntil(null);
    }
  }, [lockedUntil, remaining]);

  const show = useCallback((next: TwoFactorFeedback) => {
    setFeedback(next);
    setLockedUntil(next.lockSeconds != null ? Date.now() + next.lockSeconds * 1000 : null);
  }, []);

  const report = useCallback((error: ApiError, method?: CodeMethod) => show(twoFactorFeedback(error, method)), [show]);

  const clear = useCallback(() => {
    setFeedback(null);
    setLockedUntil(null);
  }, []);

  return { feedback, report, show, clear, locked, remaining };
}
