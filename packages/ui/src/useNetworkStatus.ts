/**
 * useNetworkStatus (C-01, `docs/padrao-premium-telas.md` §15/§12 "Sem rede"): estado de
 * conectividade via `@react-native-community/netinfo` (PP-8, versão travada na do Expo SDK
 * 58 — `12.0.1`), somado, no web, aos eventos `online`/`offline` do próprio navegador.
 *
 * Por que as duas fontes no web: no Chromium o NetInfo escuta só `navigator.connection`
 * (`change`) e ignora `online`/`offline` do `window` — um corte de rede que só dispara o
 * segundo nunca chegava às telas (achado da Íris, onda 4 e D6; detalhes em `browserOnline.ts`).
 * Antes disto o motorista tinha um contorno local (`useRobustOnlineStatus`), removido quando
 * a correção passou a valer para os dois apps aqui.
 *
 * iOS/Android: só o NetInfo (módulo nativo); `getBrowserOnlineWindow()` devolve `undefined`
 * fora do navegador e o lado do navegador fica "online" para sempre. Continua sem prova em
 * aparelho (ver PENDÊNCIAS dos handoffs do C-01).
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { combineOnline, getBrowserOnlineWindow, isNetInfoOnline, subscribeBrowserOnline } from './browserOnline';

/** `true` = conectado E a internet é alcançável. `false` quando qualquer fonte diz que não. */
export function useNetworkStatus(): boolean {
  const [netInfoOnline, setNetInfoOnline] = useState(true);
  const [browserOnline, setBrowserOnline] = useState(true);

  useEffect(() => {
    let active = true;
    NetInfo.fetch()
      .then((state) => {
        if (active) setNetInfoOnline(isNetInfoOnline(state));
      })
      .catch(() => {});
    const unsubscribe = NetInfo.addEventListener((state) => setNetInfoOnline(isNetInfoOnline(state)));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const win = getBrowserOnlineWindow();
    if (!win) return undefined;
    return subscribeBrowserOnline(win, setBrowserOnline);
  }, []);

  return combineOnline(netInfoOnline, browserOnline);
}
