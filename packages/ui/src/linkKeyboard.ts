/**
 * Teclado do link de texto no web — a parte que não depende de React nem de react-native, para o teste unitário
 * alcançar (`test/linkKeyboard.test.ts`).
 *
 * Por que existe: `Pressable` com `accessibilityRole="link"` vira `<div role="link" tabindex="0">`. O react-native-web
 * (0.21, `PressResponder`) trata `role="link"` como "elemento nativo" e NÃO chama `onPress` no `keyup`, esperando o
 * `click` que o navegador geraria num `<a href>` — mas um `<div>` não gera, então Enter não fazia nada (Q4 da Íris,
 * medido em Chromium, Firefox e WebKit). `role="button"` não tem o problema (o RNW ativa por Enter e Espaço).
 *
 * Convenção seguida (HTML `<a href>` e o padrão "Link" do WAI-ARIA APG): link ativa com ENTER, no `keydown`. ESPAÇO não
 * ativa e não é consumido — a página rola, como num link nativo (medido num `<a href>` real nos três motores).
 */

export interface LinkKeyEvent {
  readonly key: string;
  readonly repeat?: boolean;
  readonly altKey?: boolean;
}

/**
 * Enter ativa, uma vez por aperto: o auto-repeat de quem segura a tecla NÃO ativa de novo (um `router.push` por
 * repetição empilharia a mesma tela várias vezes). Alt+Enter fica de fora, como o clique com Alt do RNW (`altKey`),
 * que o navegador usa para baixar o destino de um link.
 */
export function isLinkActivationKey(event: LinkKeyEvent): boolean {
  return event.key === 'Enter' && event.repeat !== true && event.altKey !== true;
}

export interface LinkKeyDownOptions {
  /** `Platform.OS`. Só `web` recebe o tratamento: no iOS/Android o toque e a acessibilidade nativa já ativam o link. */
  readonly platform: string;
  readonly role: 'link' | 'button';
  readonly disabled: boolean;
  readonly onPress: () => void;
}

export interface LinkKeyDownProps {
  readonly onKeyDown?: (event: LinkKeyEvent) => void;
}

/**
 * Props de teclado do link. Vazio (nada é passado ao `Pressable`) fora do web e em `role="button"`, onde o RNW já
 * ativa por Enter e Espaço.
 */
export function linkKeyDownProps({ platform, role, disabled, onPress }: LinkKeyDownOptions): LinkKeyDownProps {
  if (platform !== 'web' || role !== 'link') return {};
  return {
    onKeyDown: (event) => {
      if (!disabled && isLinkActivationKey(event)) onPress();
    },
  };
}

interface MatchesTarget {
  readonly matches?: (selector: string) => boolean;
}

/**
 * O foco que acabou de chegar ao elemento é "de teclado" (o que o navegador chama de `:focus-visible`)? É a regra do
 * próprio navegador — Tab, Shift+Tab e foco programático depois de uso de teclado entram; o clique do mouse não — para o
 * anel de foco aparecer só para quem navega por teclado. Sem `matches` (nativo) devolve `false`. Navegador que não
 * conhece `:focus-visible` (lança) devolve `true`: anel a mais é melhor que foco invisível.
 */
export function isFocusVisibleEvent(event: unknown): boolean {
  const target = (event as { readonly target?: MatchesTarget } | null | undefined)?.target;
  if (!target || typeof target.matches !== 'function') return false;
  try {
    return target.matches(':focus-visible');
  } catch {
    return true;
  }
}

/**
 * O evento de foco/desfoco é do PRÓPRIO elemento que o escuta, e não de um filho? No web o `onFocus`/`onBlur` do React
 * borbulha (`focusin`/`focusout`): um contêiner que escuta foco recebe também o de cada botão dentro dele. Quem desenha
 * anel no contêiner (a rolagem do `AppShell`) só reage quando `target === currentTarget`. Sem os dois campos (nativo, ou
 * evento sem alvo) devolve `false`.
 */
export function isOwnFocusEvent(event: unknown): boolean {
  const e = event as { readonly target?: unknown; readonly currentTarget?: unknown } | null | undefined;
  if (!e || e.target == null || e.currentTarget == null) return false;
  return e.target === e.currentTarget;
}
