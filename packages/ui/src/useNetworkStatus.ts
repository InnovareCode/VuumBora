/**
 * useNetworkStatus (C-01, `docs/padrao-premium-telas.md` §15/§12 "Sem rede"): estado de
 * conectividade via `@react-native-community/netinfo` (PP-8, versão travada na do Expo SDK
 * 58 — `12.0.1`). O pacote já tem suporte a web embutido (não é um módulo nativo isolado),
 * então não existe "porta" separada para o web aqui — a mesma chamada funciona nas três
 * plataformas (ver PENDÊNCIAS do handoff: não provado em aparelho).
 */
import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/** `true` = conectado E a internet é alcançável. `false` só quando um dos dois falha. */
export function useNetworkStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    function applyState(state: { readonly isConnected: boolean | null; readonly isInternetReachable: boolean | null }) {
      setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    }
    NetInfo.fetch().then(applyState).catch(() => {});
    const unsubscribe = NetInfo.addEventListener(applyState);
    return unsubscribe;
  }, []);

  return online;
}
