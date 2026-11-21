import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../context/ApiContext';
import type { ApiError, EmailSettings } from '../api';

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: ApiError }
  | { readonly status: 'ready'; readonly data: EmailSettings };

/** Configuração de e-mail do painel. Local à tela — nada disto é global. `apply` recebe o `data` que o POST devolve (igual ao GET). */
export function useEmailSettings() {
  const api = useApi();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.emailSettings.get().then((result) => {
      if (cancelled) return;
      setState(result.ok ? { status: 'ready', data: result.data } : { status: 'error', error: result.error });
    });
    return () => {
      cancelled = true;
    };
  }, [api, version]);

  const apply = useCallback((data: EmailSettings) => setState({ status: 'ready', data }), []);
  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setVersion((v) => v + 1);
  }, []);

  return { state, apply, retry };
}
