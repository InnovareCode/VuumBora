import { useEffect, useState } from 'react';
import { useApi } from '../context/ApiContext';
import { onDriverApplicationsChanged } from '../api/driverApplicationsEvents';
import type { DriverApplicationSummary } from '../api';

export function useDriverApplicationsSummary() {
  const api = useApi();
  const [summary, setSummary] = useState<DriverApplicationSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      api.driverApplications.summary().then((result) => {
        if (!cancelled && result.ok) setSummary(result.data);
        // Erro aqui é silenciosamente degradado para "sem contagem": a lista
        // principal (useDriverApplications) já mostra o erro forte se a API
        // estiver fora do ar — duplicar o aviso não ajuda.
      });
    }
    load();
    // Recarrega quando uma candidatura é decidida em outra tela (ver
    // src/api/driverApplicationsEvents.ts) — este hook roda dentro do
    // `AppShell`, que não remonta a cada navegação.
    const unsubscribe = onDriverApplicationsChanged(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [api]);

  return summary;
}
