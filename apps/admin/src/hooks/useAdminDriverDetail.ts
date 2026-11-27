import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../context/ApiContext';
import { errorMessage, type AdminDriverDetail, type ApiError } from '../api';

export interface AdminDriverDetailState {
  readonly data: AdminDriverDetail | null;
  /** Só a PRIMEIRA carga: depois de uma decisão, `reload()` mantém a tela e liga `refreshing`. */
  readonly loading: boolean;
  readonly refreshing: boolean;
  /** Falha sem nada para mostrar (primeira carga, ou acesso retirado). */
  readonly error: string | null;
  readonly errorKind: ApiError['kind'] | null;
  /** Falha ao ATUALIZAR depois de uma decisão (rede, 5xx): o dado anterior continua na tela, com o aviso. */
  readonly refreshError: string | null;
}

const FORBIDDEN: ApiError = { kind: 'forbidden' };

export const INITIAL_DRIVER_DETAIL_STATE: AdminDriverDetailState = {
  data: null,
  loading: true,
  refreshing: false,
  error: null,
  errorKind: null,
  refreshError: null,
};

/**
 * Estado que a tela fica depois de um `403 forbidden` em QUALQUER chamada da área (recarga, visualizar,
 * aprovar, recusar, suspender, motivos): o cadastro SAI da tela — nome, CPF, endereço, CNH e veículo —
 * e fica o mesmo erro de permissão da primeira carga. Papel retirado no servidor não pode deixar dado
 * sensível à vista até alguém apertar F5.
 */
export function forbiddenDriverDetailState(): AdminDriverDetailState {
  return { data: null, loading: false, refreshing: false, error: errorMessage(FORBIDDEN), errorKind: 'forbidden', refreshError: null };
}

/**
 * Resultado de uma carga falhada. Exportada (pura) para o teste: a regra "403 descarta, rede mantém" é a
 * que a Íris achou quebrada na D7 — o modo `refresh` mantinha o dado em qualquer erro.
 */
export function failedDriverDetailState(prev: AdminDriverDetailState, mode: 'initial' | 'refresh', error: ApiError): AdminDriverDetailState {
  if (error.kind === 'forbidden') return forbiddenDriverDetailState();
  const message = errorMessage(error);
  if (mode === 'refresh' && prev.data) return { ...prev, refreshing: false, refreshError: message };
  return { data: null, loading: false, refreshing: false, error: message, errorKind: error.kind, refreshError: null };
}

/**
 * Detalhe do motorista na fila de documentos. Diferente de `useDriverApplicationDetail`, o `reload()` não
 * zera a tela: o revisor aprova um documento no meio da lista, e piscar a página inteira (perdendo a rolagem
 * e o foco) a cada decisão atrapalharia conferir os outros. A exceção é o 403 (ver `failedDriverDetailState`).
 *
 * `revokeAccess()` é para as chamadas que NÃO passam por aqui (visualizador e diálogos) avisarem do 403.
 */
export function useAdminDriverDetail(driverId: string) {
  const api = useApi();
  const [state, setState] = useState<AdminDriverDetailState>(INITIAL_DRIVER_DETAIL_STATE);
  const requestId = useRef(0);
  const hasData = state.data !== null && state.data.driverId === driverId;

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const id = ++requestId.current;
      setState((prev) => (mode === 'initial' ? INITIAL_DRIVER_DETAIL_STATE : { ...prev, refreshing: true, refreshError: null }));
      const result = await api.documentReview.driver(driverId);
      if (id !== requestId.current) return;
      if (!result.ok) {
        setState((prev) => failedDriverDetailState(prev, mode, result.error));
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

  const revokeAccess = useCallback(() => {
    // Recarga em voo que voltasse DEPOIS daqui traria o dado de volta: ela passa a ser descartada.
    requestId.current += 1;
    setState(forbiddenDriverDetailState());
  }, []);

  return { ...state, reload, revokeAccess };
}
