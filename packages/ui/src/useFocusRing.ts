/**
 * Anel de foco de TECLADO para alvos tocáveis (`Pressable`) no web — a receita do `LinkButton` (Q4 da Íris) em um lugar
 * só, para `ButtonCore`, "Voltar", "Mostrar senha", `ConsentCheckbox`, abas e linhas de lista não repetirem a conta.
 *
 * Por que existe: o contorno padrão do navegador num `<div tabindex=0>`/`<button>` some contra o fundo escuro do app.
 * No WebKit é preto sobre azul-marinho (1,08:1): a imagem muda (por isso "a imagem mudou" não prova nada), mas nenhum
 * lado tem contraste. Chromium e Firefox desenham um contorno claro e bastam; o WebKit não. Então o anel é nosso:
 * `ctaBackground` (amarelo, o mesmo foco dos campos de `InputCore`), 2pt, e SÓ para teclado — `:focus-visible`, a regra
 * do próprio navegador (Tab entra; o clique do mouse não), lida por `isFocusVisibleEvent`.
 *
 * Fora do web (iOS/Android) `focusProps` é vazio e `focusVisible` fica `false` para sempre: não há foco de teclado de
 * navegador, e o leitor de tela já tem o próprio indicador.
 */
import { useMemo, useState } from 'react';
import { Platform, type ViewStyle } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { isFocusVisibleEvent } from './linkKeyboard';

export interface FocusRingHandlers {
  readonly onFocus?: (event: unknown) => void;
  readonly onBlur?: () => void;
}

export interface KeyboardFocusRing {
  /** O foco que o elemento tem agora veio do teclado (`:focus-visible`). */
  readonly focusVisible: boolean;
  /** Espalhe no `Pressable`. Vazio fora do web. */
  readonly focusProps: FocusRingHandlers;
}

const NO_HANDLERS: FocusRingHandlers = {};

export function useKeyboardFocusRing(): KeyboardFocusRing {
  const [focusVisible, setFocusVisible] = useState(false);
  const isWeb = Platform.OS === 'web';
  const focusProps = useMemo<FocusRingHandlers>(
    () =>
      isWeb
        ? { onFocus: (event) => setFocusVisible(isFocusVisibleEvent(event)), onBlur: () => setFocusVisible(false) }
        : NO_HANDLERS,
    [isWeb],
  );
  return { focusVisible, focusProps };
}

export const FOCUS_RING_WIDTH = 2;
/** Vão entre o alvo e o anel quando o anel fica FORA dele (`outside`). */
export const FOCUS_RING_GAP = 2;

export type FocusRingPlacement = 'inside' | 'outside';

/**
 * Estilo do anel, para o `Pressable` aplicar só com `focusVisible`.
 *  - `outside`: fora da caixa, com vão de 2pt. Para alvos que são uma forma opaca e larga (botões, linhas-cartão,
 *    a linha do aceite): o anel separa a forma do fundo e não toca no conteúdo. Não ocupa espaço no layout, mas um pai
 *    com `overflow: hidden` o cortaria — use só onde o alvo tem folga até a borda do pai.
 *  - `inside`: para DENTRO da caixa (`outlineOffset` negativo). Para alvos de 44pt cujo conteúdo é pequeno e centrado
 *    (Voltar, Mostrar senha, abas), ou que encostam na borda do pai (abas na base da tela): nunca é cortado.
 * `borderRadius` é do alvo (o contorno acompanha o raio), senão o anel sai quadrado em volta de uma forma arredondada.
 */
export function focusRingStyle(placement: FocusRingPlacement, borderRadius: number): ViewStyle {
  return {
    borderRadius,
    outlineStyle: 'solid',
    outlineWidth: FOCUS_RING_WIDTH,
    outlineColor: theme.role.ctaBackground,
    outlineOffset: placement === 'inside' ? -FOCUS_RING_WIDTH : FOCUS_RING_GAP,
  };
}
