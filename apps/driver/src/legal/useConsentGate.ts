/**
 * Portão do reaceite (B3 do passageiro, replicado na B2): ao entrar em `(app)` (login ou abertura do app com sessão),
 * pergunta `identity.me()` se há Termos/Política pendentes (`consent.pending`) e diz à camada de rotas o que mostrar.
 *
 *  - `checking`: ainda perguntando (a rota mostra "verificando", nunca a Home para depois trocar de tela);
 *  - `clear`: nada a aceitar → segue para o app;
 *  - `reaccept`: há versão vigente que a conta ainda não aceitou → a tela de reaceite no lugar das rotas.
 *
 * Quando NÃO mostra reaceite (`clear`):
 *  - `consent: null` = a API está sem os textos legais (contrato do `api-client`): não há o que mostrar, a sessão vale;
 *  - `me()` falhou (rede, 5xx): o portão do app é CORTESIA — quem barra de verdade é a API (as rotas que criam
 *    compromisso novo, como ficar online, respondem `409 consent_outdated`). Falhar fechado aqui prenderia a pessoa
 *    fora do app por causa de um sinal de rede. Sessão vencida (401) já derruba a sessão sozinha e a guarda de rotas
 *    leva ao login.
 *
 * Só olha UMA vez por montagem: não reconsulta no meio da sessão (o contrato diz que ninguém é jogado para fora no
 * meio de uma corrida). O estado é LOCAL do layout: sair da conta desmonta e nada vaza para a próxima conta.
 */
import { useCallback, useEffect, useState } from 'react';
import type { PendingConsentDocument } from '@vuumbora/api-client/identity';
import { identity } from '../identity/identityClient';
import { safeCall } from '../identity/safeCall';

export type ConsentGate =
  | { readonly status: 'checking' }
  | { readonly status: 'clear' }
  | { readonly status: 'reaccept'; readonly pending: readonly PendingConsentDocument[] };

export function useConsentGate(): { readonly gate: ConsentGate; readonly clear: () => void } {
  const [gate, setGate] = useState<ConsentGate>({ status: 'checking' });

  useEffect(() => {
    let cancelled = false;
    void safeCall(() => identity.me()).then((result) => {
      if (cancelled) return;
      const consent = result.ok ? result.data.consent : null;
      setGate(consent !== null && !consent.upToDate && consent.pending.length > 0 ? { status: 'reaccept', pending: consent.pending } : { status: 'clear' });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const clear = useCallback(() => setGate({ status: 'clear' }), []);
  return { gate, clear };
}
