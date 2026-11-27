/**
 * Conectividade do NAVEGADOR (`navigator.onLine` + eventos `online`/`offline` do `window`) — a metade web que o
 * `@react-native-community/netinfo` deixa de ouvir no Chromium.
 *
 * Por que existe (dívida achada pela Íris na onda 4 e na D6): no web, o NetInfo escolhe UMA fonte na hora do import.
 * Quando `navigator.connection` existe (Chromium tem a Network Information API), ele escuta só
 * `connection.addEventListener('change', …)` e ignora `online`/`offline` do `window`. Um corte de rede que só dispara
 * o `offline` do `window` (o `context.setOffline()` do Playwright, e qualquer navegador que derrube a rede sem mexer na
 * Network Information API) nunca chegava ao `useNetworkStatus`: sem faixa "Sem conexão", sem botões desabilitados.
 * O WebKit não tem `navigator.connection`, por isso lá sempre funcionou.
 *
 * Sem React e sem `react-native` aqui: o hook (`useNetworkStatus`) junta as duas fontes; este arquivo só sabe ler e
 * assinar o navegador, para a regra ser testável no `node --test` com um `window` falso.
 */

/** Só o pedaço do `window` que usamos — evita puxar a lib `dom` inteira para o pacote (ela conflita com tipos já
 * assumidos em `src/device`, ver `tsconfig.test.json`). */
export interface BrowserOnlineWindow {
  readonly navigator: { readonly onLine: boolean };
  addEventListener(type: 'online' | 'offline', listener: () => void): void;
  removeEventListener(type: 'online' | 'offline', listener: () => void): void;
}

/** O `window` do navegador, ou `undefined` fora dele (iOS/Android, renderização no servidor, `node --test`). */
export function getBrowserOnlineWindow(scope: unknown = globalThis): BrowserOnlineWindow | undefined {
  const candidate = (scope as { window?: Partial<BrowserOnlineWindow> } | null | undefined)?.window;
  if (!candidate || typeof candidate.addEventListener !== 'function' || typeof candidate.removeEventListener !== 'function') {
    return undefined;
  }
  if (!candidate.navigator || typeof candidate.navigator.onLine !== 'boolean') return undefined;
  return candidate as BrowserOnlineWindow;
}

/**
 * Lê `navigator.onLine` agora e a cada `online`/`offline`, entregando o valor a `onChange`. Devolve a função que
 * desliga os dois ouvintes. `navigator.onLine === false` é confiável (o aparelho não tem rede); `true` só diz que há
 * ALGUMA interface — por isso o hook combina com o NetInfo em vez de confiar só nisto.
 */
export function subscribeBrowserOnline(win: BrowserOnlineWindow, onChange: (online: boolean) => void): () => void {
  const update = () => onChange(win.navigator.onLine);
  update();
  win.addEventListener('online', update);
  win.addEventListener('offline', update);
  return () => {
    win.removeEventListener('online', update);
    win.removeEventListener('offline', update);
  };
}

/** Estado do NetInfo que importa aqui (os dois campos podem vir `null` enquanto ele ainda não sabe). */
export interface NetInfoReachability {
  readonly isConnected: boolean | null;
  readonly isInternetReachable: boolean | null;
}

/** NetInfo: `false` só quando um dos dois campos É `false` — `null` (ainda não sabe) conta como online. */
export function isNetInfoOnline(state: NetInfoReachability): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/** Online só quando as duas fontes concordam: qualquer uma dizendo "sem rede" basta para a tela mostrar o estado. */
export function combineOnline(netInfoOnline: boolean, browserOnline: boolean): boolean {
  return netInfoOnline && browserOnline;
}
