import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../context/ApiContext';
import { errorMessage, type AdminDriverDetail, type ApiError } from '../api';

interface State {
  readonly data: AdminDriverDetail | null;
  /** Só a PRIMEIRA carga: depois de uma decisão, `reload()` mantém a tela e liga `refreshing`. */
  readonly loading: boolean;
  readonly refreshing: boolean;
  /** Falha sem nada para mostrar (primeira carga). */
  readonly error: string | null;
  readonly errorKind: ApiError['kind'] | null;
  /** Falha ao ATUALIZAR depois de uma decisão: o dado anterior continua na tela, com o aviso. */
  readonly refreshError: string | null;
}

/**
 * Detalhe do motorista na fila de documentos. Diferente de `useDriverApplicationDetail`, o `reload()` não
 * zera a tela: o revisor aprova um documento no meio da lista, e piscar a página inteira (perdendo a rolagem
 * e o foco) a cada decisão atrapalharia conferir os outros.
 */
export function useAdminDriverDetail(driverId: string) {
  const api = useApi();
  const [state, setState] = useState<State>({ data: null, loading: true, refreshing: false, error: null, errorKind: null, refreshError: null });
  const requestId = useRef(0);
  const hasData = state.data !== null && state.data.driverId === driverId;

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const id = ++requestId.current;
      setState((prev) =>
        mode === 'initial'
          ? { data: null, loading: true, refreshing: false, error: null, errorKind: null, refreshError: null }
          : { ...prev, refreshing: true, refreshError: null },
      );
      const result = await api.documentReview.driver(driverId);
      if (id !== requestId.current) return;
      if (!result.ok) {
        const message = errorMessage(result.error);
        setState((prev) =>
          mode === 'refresh' && prev.data
            ? { ...prev, refreshing: false, refreshError: message }
            : { data: null, loading: false, refreshing: false, error: message, errorKind: result.error.kind, refreshError: null },
        );
        return;
      }
      setState({ data: result.data, loading: false, refreshing: false, error: null, errorKind: null, refreshError: null });
    },
    [api, driverId],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  const reload = useCallback(() => load(hasData ? 'refresh' : 'initial'), [load, hasData]);

  return { ...state, reload };
}
