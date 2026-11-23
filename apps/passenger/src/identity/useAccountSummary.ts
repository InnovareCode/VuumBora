import { useCallback, useEffect, useState } from 'react';
import type { AccountSummary } from '@vuumbora/api-client/identity';
import { identity } from './identityClient';
import { safeCall } from './safeCall';

export type AccountSummaryState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly account: AccountSummary };

export interface UseAccountSummaryResult {
  readonly state: AccountSummaryState;
  readonly retry: () => void;
}

/**
 * `GET /me` para Perfil (P13) e Meus dados (`/perfil/dados`) — SEM cache entre as duas telas
 * (cada uma busca a própria vez; a conta não muda com frequência e duplicar a chamada é mais
 * simples e mais seguro do que inventar uma store nova para isto).
 *
 * **O que o contrato NÃO devolve** (`AccountSummary`, `packages/api-client/src/identity/types.ts`):
 * e-mail, telefone e data de nascimento — só `id`, `publicId`, `fullName` e `accountType`. A
 * ficha P13 pedia e-mail/telefone na tela; não entraram aqui por não existirem na resposta real
 * (reportado como pendência no handoff, não inventado).
 */
export function useAccountSummary(): UseAccountSummaryResult {
  const [state, setState] = useState<AccountSummaryState>({ status: 'loading' });

  const load = useCallback(() => {
    setState({ status: 'loading' });
    void (async () => {
      const result = await safeCall(() => identity.me());
      setState(result.ok ? { status: 'ready', account: result.data } : { status: 'error' });
    })();
  }, []);

  useEffect(() => load(), [load]);

  return { state, retry: load };
}
