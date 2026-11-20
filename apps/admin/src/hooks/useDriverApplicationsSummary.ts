import { useEffect, useState } from 'react';
import { useApi } from '../context/ApiContext';
import type { DriverApplicationSummary } from '../api';

export function useDriverApplicationsSummary() {
  const api = useApi();
  const [summary, setSummary] = useState<DriverApplicationSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.driverApplications.summary().then((result) => {
      if (!cancelled && result.ok) setSummary(result.data);
      // Erro aqui é silenciosamente degradado para "sem contagem": a lista
      // principal (useDriverApplications) já mostra o erro forte se a API
      // estiver fora do ar — duplicar o aviso não ajuda.
    });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return summary;
}
