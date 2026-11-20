/**
 * Avisa quem exibe a contagem de pendências (hoje: o badge da sidebar via
 * `useDriverApplicationsSummary`) que uma candidatura mudou de status.
 *
 * Sem isto, aprovar/recusar deixava o contador do menu visivelmente errado
 * pelo resto da sessão — a sidebar mora no `AppShell`, que monta UMA vez por
 * sessão autenticada (ver `project_apps_admin_shell_moda_shop`), então o
 * número nunca se atualizava sozinho. Mesmo padrão de `onUnauthorized` em
 * `src/api/client.ts` (pub/sub mínimo, sem trazer dependência nova).
 */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onDriverApplicationsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyDriverApplicationsChanged(): void {
  for (const listener of listeners) listener();
}
