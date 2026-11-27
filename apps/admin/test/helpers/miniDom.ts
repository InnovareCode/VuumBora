/**
 * DOM MÍNIMO para renderizar componentes do painel no `node --test`, com efeitos e cliques de verdade
 * (react-dom/client + `act`). Existe porque o monorepo não tem jsdom/happy-dom/testing-library, e
 * acrescentar um deles mexe no `package-lock.json` (fora da zona do admin). Teste que só lê o código não
 * pega um `useEffect` que pede a URL do documento na montagem — este pega.
 *
 * Cobre o que o react-dom 19 e os componentes da D7 usam: árvore de nós, atributos, estilo, texto, foco,
 * eventos com captura/borbulha (o React escuta na raiz). `querySelectorAll` é um stub vazio (o
 * `useFocusTrap` cai no "foca o contêiner"). NÃO é um navegador: layout, CSS e acessibilidade se medem no
 * Playwright, não aqui.
 *
 * Tem de ser importado ANTES de `react-dom` (o react-dom decide `canUseDOM` ao carregar).
 */

type Listener = { readonly fn: (event: MiniEvent) => void; readonly capture: boolean };

export class MiniEvent {
  readonly type: string;
  readonly bubbles: boolean;
  readonly cancelable: boolean;
  readonly timeStamp = Date.now();
  readonly isTrusted = false;
  target: MiniNode | null = null;
  currentTarget: MiniNode | null = null;
  eventPhase = 0;
  defaultPrevented = false;
  propagationStopped = false;
  constructor(type: string, init: { readonly bubbles?: boolean; readonly cancelable?: boolean } = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? false;
    this.cancelable = init.cancelable ?? false;
  }
  preventDefault(): void {
    this.defaultPrevented = true;
  }
  stopPropagation(): void {
    this.propagationStopped = true;
  }
  stopImmediatePropagation(): void {
    this.propagationStopped = true;
  }
  getModifierState(): boolean {
    return false;
  }
}

export class MiniNode {
  nodeType = 0;
  nodeName = '';
  parentNode: MiniNode | null = null;
  childNodes: MiniNode[] = [];
  ownerDocument!: MiniDocument;
  private readonly listeners = new Map<string, Listener[]>();

  get firstChild(): MiniNode | null {
    return this.childNodes[0] ?? null;
  }
  get lastChild(): MiniNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }
  get nextSibling(): MiniNode | null {
    const siblings = this.parentNode?.childNodes ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }
  get previousSibling(): MiniNode | null {
    const siblings = this.parentNode?.childNodes ?? [];
    return siblings[siblings.indexOf(this) - 1] ?? null;
  }
  get parentElement(): MiniElement | null {
    return this.parentNode instanceof MiniElement ? this.parentNode : null;
  }
  appendChild<T extends MiniNode>(child: T): T {
    child.parentNode?.removeChild(child);
    this.childNodes.push(child);
    child.parentNode = this;
    return child;
  }
  insertBefore<T extends MiniNode>(child: T, before: MiniNode | null): T {
    if (!before) return this.appendChild(child);
    child.parentNode?.removeChild(child);
    const at = this.childNodes.indexOf(before);
    this.childNodes.splice(at === -1 ? this.childNodes.length : at, 0, child);
    child.parentNode = this;
    return child;
  }
  removeChild<T extends MiniNode>(child: T): T {
    const at = this.childNodes.indexOf(child);
    if (at !== -1) this.childNodes.splice(at, 1);
    child.parentNode = null;
    return child;
  }
  contains(node: MiniNode | null): boolean {
    for (let current = node; current; current = current.parentNode) if (current === this) return true;
    return false;
  }
  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join('');
  }
  set textContent(value: string | null) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    if (value) this.appendChild(this.ownerDocument.createTextNode(String(value)));
  }
  addEventListener(type: string, fn: (event: MiniEvent) => void, options?: boolean | { readonly capture?: boolean }): void {
    const capture = typeof options === 'boolean' ? options : !!options?.capture;
    const list = this.listeners.get(type) ?? [];
    list.push({ fn, capture });
    this.listeners.set(type, list);
  }
  removeEventListener(type: string, fn: (event: MiniEvent) => void, options?: boolean | { readonly capture?: boolean }): void {
    const capture = typeof options === 'boolean' ? options : !!options?.capture;
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item.fn !== fn || item.capture !== capture));
  }
  /** Captura (de cima para baixo), alvo, borbulha (de baixo para cima), como no navegador. */
  dispatchEvent(event: MiniEvent): boolean {
    event.target = this;
    const path: MiniNode[] = [];
    for (let node: MiniNode | null = this; node; node = node.parentNode) path.push(node);
    const run = (node: MiniNode, capture: boolean | null) => {
      event.currentTarget = node;
      for (const listener of [...(node.listeners.get(event.type) ?? [])]) {
        if (capture === null || listener.capture === capture) listener.fn.call(node, event);
      }
    };
    for (const node of [...path].reverse().slice(0, -1)) {
      event.eventPhase = 1;
      run(node, true);
      if (event.propagationStopped) return !event.defaultPrevented;
    }
    event.eventPhase = 2;
    run(this, null);
    if (event.bubbles) {
      for (const node of path.slice(1)) {
        if (event.propagationStopped) break;
        event.eventPhase = 3;
        run(node, false);
      }
    }
    event.currentTarget = null;
    return !event.defaultPrevented;
  }
}

export class MiniText extends MiniNode {
  data: string;
  constructor(owner: MiniDocument, data: string) {
    super();
    this.nodeType = 3;
    this.nodeName = '#text';
    this.ownerDocument = owner;
    this.data = data;
  }
  get nodeValue(): string {
    return this.data;
  }
  set nodeValue(value: string) {
    this.data = value;
  }
  override get textContent(): string {
    return this.data;
  }
  override set textContent(value: string | null) {
    this.data = value ?? '';
  }
}

export class MiniComment extends MiniNode {
  data: string;
  constructor(owner: MiniDocument, data: string) {
    super();
    this.nodeType = 8;
    this.nodeName = '#comment';
    this.ownerDocument = owner;
    this.data = data;
  }
  override get textContent(): string {
    return '';
  }
}

export class MiniElement extends MiniNode {
  readonly tagName: string;
  readonly localName: string;
  readonly namespaceURI: string;
  readonly attributes = new Map<string, string>();
  readonly style: Record<string, string> & { setProperty(name: string, value: string): void; removeProperty(name: string): void };
  constructor(owner: MiniDocument, tag: string, namespace = 'http://www.w3.org/1999/xhtml') {
    super();
    this.nodeType = 1;
    this.ownerDocument = owner;
    this.localName = tag;
    this.namespaceURI = namespace;
    this.tagName = namespace === 'http://www.w3.org/1999/xhtml' ? tag.toUpperCase() : tag;
    this.nodeName = this.tagName;
    const style: Record<string, string> = {};
    this.style = Object.assign(style, {
      setProperty(name: string, value: string) {
        style[name] = value;
      },
      removeProperty(name: string) {
        delete style[name];
      },
    });
  }
  /** Em HTML o nome do atributo não diferencia maiúsculas (o React manda `referrerPolicy`, o DOM guarda `referrerpolicy`). */
  private attrName(name: string): string {
    return this.namespaceURI === 'http://www.w3.org/1999/xhtml' ? name.toLowerCase() : name;
  }
  setAttribute(name: string, value: unknown): void {
    this.attributes.set(this.attrName(name), String(value));
  }
  setAttributeNS(_namespace: string | null, name: string, value: unknown): void {
    this.attributes.set(name, String(value));
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(this.attrName(name)) ?? null;
  }
  hasAttribute(name: string): boolean {
    return this.attributes.has(this.attrName(name));
  }
  removeAttribute(name: string): void {
    this.attributes.delete(this.attrName(name));
  }
  removeAttributeNS(_namespace: string | null, name: string): void {
    this.attributes.delete(name);
  }
  focus(): void {
    this.ownerDocument.activeElement = this;
  }
  blur(): void {
    if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body;
  }
  querySelectorAll(): MiniElement[] {
    return [];
  }
  querySelector(): MiniElement | null {
    return null;
  }
  getBoundingClientRect() {
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  scrollIntoView(): void {}
  get offsetParent(): null {
    return null;
  }
}

export class MiniDocument extends MiniNode {
  readonly documentElement: MiniElement;
  readonly body: MiniElement;
  activeElement: MiniElement;
  readonly defaultView = globalThis;
  /** O react-dom testa `'oninput' in document` para decidir se escuta `input` (senão cai num polyfill por foco). */
  oninput: null = null;
  constructor() {
    super();
    this.nodeType = 9;
    this.nodeName = '#document';
    this.ownerDocument = this;
    this.documentElement = this.appendChild(new MiniElement(this, 'html'));
    this.body = this.documentElement.appendChild(new MiniElement(this, 'body'));
    this.activeElement = this.body;
  }
  createElement(tag: string): MiniElement {
    return new MiniElement(this, tag.toLowerCase());
  }
  createElementNS(namespace: string, tag: string): MiniElement {
    return new MiniElement(this, tag, namespace);
  }
  createTextNode(data: string): MiniText {
    return new MiniText(this, data);
  }
  createComment(data: string): MiniComment {
    return new MiniComment(this, data);
  }
  getElementById(): null {
    return null;
  }
  querySelectorAll(): MiniElement[] {
    return [];
  }
  querySelector(): MiniElement | null {
    return null;
  }
}

/** Instala `window`/`document` globais. Idempotente; devolve o documento. */
export function installMiniDom(): MiniDocument {
  const g = globalThis as Record<string, unknown>;
  if (g['document'] instanceof MiniDocument) return g['document'];
  const document = new MiniDocument();
  const windowListeners = new MiniNode();
  Object.assign(g, {
    window: globalThis,
    document,
    location: { protocol: 'http:', href: 'http://localhost/', origin: 'http://localhost', host: 'localhost', pathname: '/', search: '', hash: '' },
    Node: MiniNode,
    Element: MiniElement,
    HTMLElement: MiniElement,
    HTMLIFrameElement: class HTMLIFrameElement {},
    Event: MiniEvent,
    IS_REACT_ACT_ENVIRONMENT: true,
    addEventListener: windowListeners.addEventListener.bind(windowListeners),
    removeEventListener: windowListeners.removeEventListener.bind(windowListeners),
  });
  return document;
}

installMiniDom();
