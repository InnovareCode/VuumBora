import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../context/ApiContext';
import { errorMessage, type ApiError, type DocumentReviewQueueItem, type DriverDocumentStatus } from '../api';

interface State {
  readonly items: readonly DocumentReviewQueueItem[];
  readonly nextCursor: string | null;
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly error: string | null;
  /** Para a tela não oferecer "tentar de novo" num 403 (papel não muda com retry). */
  readonly errorKind: ApiError['kind'] | null;
}

const PAGE_SIZE = 20;

/**
 * Estado LOCAL da fila de documentos — filtro e paginação não interessam a mais nenhuma tela, então não
 * vão para Context (mesmo padrão de `useAdminUsers`/`useDriverApplications`). A ordem é a do servidor
 * (mais antigo primeiro): a tela não reordena.
 */
export function useDocumentReviewQueue(status: DriverDocumentStatus) {
  const api = useApi();
  const [state, setState] = useState<State>({ items: [], nextCursor: null, loading: true, loadingMore: false, error: null, errorKind: null });
  // Resposta antiga (filtro trocado rápido) não sobrescreve a nova.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setState((prev) => ({ ...prev, loading: true, error: null, errorKind: null }));
    const result = await api.documentReview.queue({ status, limit: PAGE_SIZE });
    if (id !== requestId.current) return;
    if (!result.ok) {
      setState((prev) => ({ ...prev, items: [], nextCursor: null, loading: false, error: errorMessage(result.error), errorKind: result.error.kind }));
      return;
    }
    setState({ items: result.data.items, nextCursor: result.data.nextCursor ?? null, loading: false, loadingMore: false, error: null, errorKind: null });
  }, [api, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!state.nextCursor || state.loadingMore) return;
    const id = requestId.current;
    setState((prev) => ({ ...prev, loadingMore: true }));
    const result = await api.documentReview.queue({ status, limit: PAGE_SIZE, cursor: state.nextCursor });
    if (id !== requestId.current) return;
    if (!result.ok) {
      setState((prev) => ({ ...prev, loadingMore: false, error: errorMessage(result.error), errorKind: result.error.kind }));
      return;
    }
    setState((prev) => ({
      items: [...prev.items, ...result.data.items],
      nextCursor: result.data.nextCursor ?? null,
      loading: false,
      loadingMore: false,
      error: null,
      errorKind: null,
    }));
  }, [api, status, state.nextCursor, state.loadingMore]);

  return { ...state, reload: load, loadMore };
}
