import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../context/ApiContext';
import { errorMessage, type AdminRole, type AdminUserRecord } from '../api';

export type RoleFilter = AdminRole | 'all';

interface State {
  readonly items: readonly AdminUserRecord[];
  readonly nextCursor: string | null;
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly error: string | null;
}

/**
 * Estado LOCAL da tela (filtro de papel, "ver desativados" e paginação) —
 * mesmo padrão de `useDriverApplications`: nada disto interessa a mais
 * nenhuma tela, então não vai para Context (responsabilidade #3).
 */
export function useAdminUsers(role: RoleFilter, includeDeactivated: boolean) {
  const api = useApi();
  const [state, setState] = useState<State>({ items: [], nextCursor: null, loading: true, loadingMore: false, error: null });
  // Evita que uma resposta antiga (filtro trocado rápido) sobrescreva a nova.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    const result = await api.adminUsers.list({ role: role === 'all' ? undefined : role, includeDeactivated, limit: 30 });
    if (id !== requestId.current) return;
    if (!result.ok) {
      setState((prev) => ({ ...prev, loading: false, error: errorMessage(result.error) }));
      return;
    }
    setState({ items: result.data.items, nextCursor: result.data.nextCursor, loading: false, loadingMore: false, error: null });
  }, [api, role, includeDeactivated]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!state.nextCursor || state.loadingMore) return;
    setState((prev) => ({ ...prev, loadingMore: true }));
    const result = await api.adminUsers.list({
      role: role === 'all' ? undefined : role,
      includeDeactivated,
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
  }, [api, role, includeDeactivated, state.nextCursor, state.loadingMore]);

  return { ...state, reload: load, loadMore };
}
