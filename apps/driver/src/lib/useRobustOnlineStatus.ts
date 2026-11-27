import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useNetworkStatus } from '@vuumbora/ui';

/** Só o pedaço do `window` que este hook usa — evita puxar a lib `dom` inteira (ela conflita com
 * tipos já assumidos em `packages/ui`, ex. `sha256OfBytes.ts`, que não esperam o `Uint8Array`/
 * `ArrayBuffer` da lib DOM mais nova). */
interface BrowserWindow {
  readonly navigator: { readonly onLine: boolean };
  addEventListener(type: 'online' | 'offline', listener: () => void): void;
  removeEventListener(type: 'online' | 'offline', listener: () => void): void;
}

function getBrowserWindow(): BrowserWindow | undefined {
  return (globalThis as { window?: BrowserWindow }).window;
}

/**
 * `useNetworkStatus` (`@vuumbora/ui`, C-01) já cobre o caso real (`@react-native-community/netinfo`,
 * nativo e web) — mas no CHROMIUM, quando `navigator.connection` existe, o NetInfo escuta
 * `connection.addEventListener('change', …)` em vez de `window.addEventListener('online'/'offline')`,
 * e o `context.setOffline()` do Playwright só dispara o segundo (achado já documentado no comentário
 * de `NetworkBanner.tsx`, `packages/ui`). Este hook soma um ouvinte DIRETO do evento do navegador
 * (que dispara nos dois motores, confirmado) como rede de segurança — sem mexer em `packages/ui`
 * (fora da zona desta correção, 27/11/2026): só os botões que precisam reagir a "sem rede" num teste
 * ao vivo em Chromium usam este hook, não o resto do app.
 */
export function useRobustOnlineStatus(): boolean {
  const netInfoOnline = useNetworkStatus();
  const [browserOnline, setBrowserOnline] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const maybeWin = getBrowserWindow();
    if (!maybeWin) return undefined;
    const win = maybeWin;
    function update() {
      setBrowserOnline(win.navigator.onLine);
    }
    update();
    win.addEventListener('online', update);
    win.addEventListener('offline', update);
    return () => {
      win.removeEventListener('online', update);
      win.removeEventListener('offline', update);
    };
  }, []);

  return netInfoOnline && browserOnline;
}
