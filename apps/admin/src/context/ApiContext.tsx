import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createApi, type Api } from '../api';

const ApiContext = createContext<Api | null>(null);

export function ApiProvider({
  children,
  api: injected,
}: {
  readonly children: ReactNode;
  /** Só para teste (`apps/admin/test`): uma porta falsa no lugar de `createApi()`. O app nunca passa isto. */
  readonly api?: Api;
}) {
  // Uma instância por carregamento da página — não recria a cada render.
  const api = useMemo(() => injected ?? createApi(), []);
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi() precisa de <ApiProvider> acima na árvore.');
  return api;
}
