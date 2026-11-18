/**
 * Composição central de tipografia — ninguém combina fontFamily/fontSize/lineHeight
 * à mão num componente. Fonte da marca: Plus Jakarta Sans, 4 TTFs estáticos (ver
 * docs/tipografia.md). Fonte variável não é confiável no Android (o eixo `wght` não
 * mapeia por `fontWeight`), por isso `theme.typography.family` é um nome de família
 * POR PESO, não uma família só — nunca combine `fontFamily` de um peso com
 * `fontWeight` de outro.
 *
 * Regra do Apolo: nunca `regular` (400) vira peso mais fino que isso sobre fundo
 * escuro — por isso não existe peso "light"/"thin" no token nem aqui.
 *
 * Símbolos decorativos (✓ ✕ ! i • ▲ ▼ ○ ‹) ficam DE FORA da família da marca de
 * propósito: Plus Jakarta Sans é um charset latino, sem garantia de cobrir dingbats/
 * setas, e RN nativo (ao contrário da Web) não faz fallback de glifo por caractere —
 * um glifo ausente vira "tofu" (caixa vazia) em vez de cair pra fonte do sistema.
 * Por isso esses glifos continuam só com `fontWeight` (fonte do sistema), nunca com
 * `fontFamily` da marca. Ver [[licoes-tipografia-plus-jakarta-sans]] na memória.
 */
import type { TextStyle } from 'react-native';
import { theme } from '@vuumbora/tokens';

export type TextWeightKey = keyof typeof theme.typography.family;
export type TextSizeKey = keyof typeof theme.typography.size;
export type NumericFontWeight = (typeof theme.typography.weight)[keyof typeof theme.typography.weight];

/** Proporção padrão de altura de linha quando o estilo não precisa de uma própria. */
const LINE_HEIGHT_RATIO = 1.3;

/**
 * fontFamily (peso certo) + fontSize + lineHeight explícito — para todo texto de
 * palavra/frase (rótulo, título, corpo, descrição). NÃO usar em glifo/símbolo
 * decorativo isolado (ver nota do módulo).
 */
export function textStyle(weight: TextWeightKey, sizeKey: TextSizeKey): TextStyle {
  const fontSize = theme.typography.size[sizeKey];
  return {
    fontFamily: theme.typography.family[weight],
    fontSize,
    lineHeight: Math.round(fontSize * LINE_HEIGHT_RATIO),
  };
}

/** Mesma ideia de `textStyle`, mas para um `fontSize` calculado em runtime (ex.: BrandLogo). */
export function textStyleForSize(weight: TextWeightKey, fontSize: number): TextStyle {
  return {
    fontFamily: theme.typography.family[weight],
    fontSize,
    lineHeight: Math.round(fontSize * LINE_HEIGHT_RATIO),
  };
}

/**
 * Obrigatório em todo valor que muda na tela: preço, ETA, distância, placa, horário,
 * contador (docs/tipografia.md). Sem isso, o dígito muda de largura a cada troca e o
 * número "dança". Combine com `textStyle`: `{ ...textStyle('bold', 'title'), ...tabularNums }`.
 */
export const tabularNums: TextStyle = { fontVariant: ['tabular-nums'] };

/**
 * fontSize + lineHeight explícito + fontWeight — para glifo/símbolo decorativo
 * (✓ ✕ ! i • ▲ ▼ ○ ‹) que fica de propósito na fonte do sistema (ver nota do
 * módulo). `lineHeight` é regra do Apolo pra todo estilo de texto, sem exceção —
 * inclusive quem não leva a fonte da marca.
 */
export function glyphStyle(weight: NumericFontWeight, sizeKey: TextSizeKey): TextStyle {
  const fontSize = theme.typography.size[sizeKey];
  return {
    fontSize,
    fontWeight: weight,
    lineHeight: Math.round(fontSize * LINE_HEIGHT_RATIO),
  };
}
