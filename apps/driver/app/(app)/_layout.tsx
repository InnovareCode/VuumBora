import { Stack } from 'expo-router';
import { ConsentChecking } from '../../src/components/legal/ConsentChecking';
import { ConsentReacceptScreen } from '../../src/components/legal/ConsentReacceptScreen';
import { useConsentGate } from '../../src/legal/useConsentGate';
import { stackScreenOptions } from '../../src/navigation/stackScreenOptions';

/**
 * Rotas do produto: só montadas com sessão (ver `Stack.Protected` em `app/_layout.tsx`). A Home é o `index`.
 *
 * Portão do reaceite (B3 do passageiro, replicado na B2): antes de montar as rotas, `useConsentGate` pergunta a `me()`
 * se há Termos/Política com versão nova ainda não aceita. Há: a tela de reaceite ocupa o lugar do `Stack` (URL direta
 * e deep link não a contornam); aceitou, as rotas montam na URL em que a pessoa estava. Não há (ou a API está sem
 * textos, ou `me()` falhou): segue. Ver `src/legal/useConsentGate.ts` para o que cada caso significa.
 */
export const unstable_settings = { anchor: 'index' };

export default function AppLayout() {
  const { gate, clear } = useConsentGate();

  if (gate.status === 'checking') return <ConsentChecking />;
  if (gate.status === 'reaccept') return <ConsentReacceptScreen pending={gate.pending} onDone={clear} />;
  return <Stack screenOptions={stackScreenOptions} />;
}
