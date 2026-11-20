import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../context/ApiContext';
import { errorMessage, type DriverApplication, type DriverApplicationStatus } from '../api';

export type StatusFilter = DriverApplicationStatus | 'all';

interface State {
  readonly items: readonly DriverApplication[];
  readonly nextCursor: string | null;
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly error: string | null;
}

/**
 * Estado LOCAL da tela de lista — filtro, busca e paginação não interessam a
 * mais nada no app, então não vão para Context (responsabilidade #3).
 */
export function useDriverApplications(status: StatusFilter, q: string) {
  const api = useApi();
  const [state, setState] = useState<State>({ items: [], nextCursor: null, loading: true, loadingMore: false, error: null });
  // Evita que uma resposta antiga (filtro trocado rápido) sobrescreva a nova.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const result = await api.driverApplications.list({ status: status === 'all' ? undefined : status, q: q || undefined, limit: 30 });
    if (id !== requestId.current) return;
    if (!result.ok) {
      setState((prev) => ({ ...prev, loading: false, error: errorMessage(result.error) }));
      return;
    }
    setState({ items: result.data.items, nextCursor: result.data.nextCursor, loading: false, loadingMore: false, error: null });
  }, [api, status, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!state.nextCursor || state.loadingMore) return;
    setState((prev) => ({ ...prev, loadingMore: true }));
    const result = await api.driverApplications.list({
      status: status === 'all' ? undefined : status,
      q: q || undefined,
      limit: 30,
      cursor: state.nextCursor,
    });
    if (!result.ok) {
      setState((prev) => ({ ...prev, loadingMore: false, error: errorMessage(result.error) }));
      return;
    }
    setState((prev) => ({
      items: [...prev.items, ...result.data.items],
      nextCursor: result.data.nextCursor,
      loading: false,
      loadingMore: false,
      error: null,
    }));
  }, [api, status, q, state.nextCursor, state.loadingMore]);

  return { ...state, reload: load, loadMore };
}
