import { useCallback, useEffect, useState } from 'react';
import { useApi } from '../context/ApiContext';
import { errorMessage, type DriverApplication } from '../api';

interface State {
  readonly data: DriverApplication | null;
  readonly loading: boolean;
  readonly error: string | null;
}

export function useDriverApplicationDetail(id: string) {
  const api = useApi();
  const [state, setState] = useState<State>({ data: null, loading: true, error: null });

  const load = useCallback(async () => {
    setState({ data: null, loading: true, error: null });
    const result = await api.driverApplications.get(id);
    if (!result.ok) {
      setState({ data: null, loading: false, error: errorMessage(result.error) });
      return;
    }
    setState({ data: result.data, loading: false, error: null });
  }, [api, id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { ...state, reload: load };
}
