import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../context/ApiContext';
import type { ApiError, TwoFactorStatus } from '../api';

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: ApiError }
  | { readonly status: 'ready'; readonly data: TwoFactorStatus };

/** Estado do segundo fator da conta logada. Local à tela de Segurança — nada disto é global. */
export function useTwoFactorStatus() {
  const api = useApi();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.twoFactor.status().then((result) => {
      if (cancelled) return;
      setState(result.ok ? { status: 'ready', data: result.data } : { status: 'error', error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [api, version]);

  // Recarregar sem piscar "carregando": o conteúdo antigo fica até o novo chegar.
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setVersion((v) => v + 1);
  }, []);

  return { state, reload, retry };
}
