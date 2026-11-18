/**
 * @vuumbora/tokens — tema derivado da fonte única de tokens.
 *
 * Fonte única: VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json (formato W3C DTCG).
 * Regra: nenhum valor de cor/dimensão é escrito à mão aqui nem em qualquer outro pacote/app.
 * Para mudar uma cor, edite o JSON — este módulo só converte o formato.
 *
 * Observação: VuumBora_Claude_Design_System/codigo/theme.ts é material de referência legado
 * e NÃO é importado (diverge do JSON; ver docs/decisions.md, D-06).
 */
import raw from '../../../VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json';

type Token<V> = { readonly $type: string; readonly $value: V };
type Group<V> = { readonly [key: string]: Token<V> };

const PX = /^(-?\d+(?:\.\d+)?)px$/;

/** "16px" -> 16 (React Native trabalha em dp sem unidade). Falha alto se o formato mudar. */
function px(value: string, path: string): number {
  const match = PX.exec(value);
  const n = match?.[1];
  if (n === undefined) {
    throw new Error(`[tokens] dimensão inválida em ${path}: "${value}" (esperado "<n>px")`);
  }
  return Number(n);
}

function colors<G extends Group<string>>(group: G): { readonly [K in keyof G]: string } {
  const out: Record<string, string> = {};
  for (const [key, token] of Object.entries(group)) out[key] = token.$value;
  return out as { readonly [K in keyof G]: string };
}

function dimensions<G extends Group<string>>(group: G, path: string): { readonly [K in keyof G]: number } {
  const out: Record<string, number> = {};
  for (const [key, token] of Object.entries(group)) out[key] = px(token.$value, `${path}.${key}`);
  return out as { readonly [K in keyof G]: number };
}

function numbers<G extends Group<number>>(group: G): { readonly [K in keyof G]: number } {
  const out: Record<string, number> = {};
  for (const [key, token] of Object.entries(group)) out[key] = token.$value;
  return out as { readonly [K in keyof G]: number };
}

export type FontWeight = '400' | '500' | '600' | '700';

function fontWeights<G extends Group<number>>(group: G): { readonly [K in keyof G]: FontWeight } {
  const out: Record<string, FontWeight> = {};
  for (const [key, token] of Object.entries(group)) out[key] = String(token.$value) as FontWeight;
  return out as { readonly [K in keyof G]: FontWeight };
}

/** Primitivos: espelho 1:1 do JSON, já em unidades de React Native. */
export const tokens = {
  meta: { name: raw.name, version: raw.version, status: raw.status },
  color: {
    brand: colors(raw.color.brand),
    background: colors(raw.color.background),
    text: colors(raw.color.text),
    border: colors(raw.color.border),
    semantic: colors(raw.color.semantic),
    map: colors(raw.color.map),
  },
  spacing: dimensions(raw.spacing, 'spacing'),
  radius: dimensions(raw.radius, 'radius'),
  typography: {
    family: raw.typography.family.$value,
    size: dimensions(raw.typography.size, 'typography.size'),
    weight: fontWeights(raw.typography.weight),
  },
  layout: dimensions(raw.layout, 'layout'),
  opacity: numbers(raw.opacity),
} as const;

/**
 * Papéis semânticos: o que os componentes consomem. Apenas APONTAM para primitivos —
 * trocar um papel de cor nunca exige escrever um HEX.
 */
export const theme = {
  ...tokens,
  role: {
    screen: tokens.color.background.base,
    surface: tokens.color.background.surface,
    surfaceElevated: tokens.color.background.elevated,
    input: tokens.color.background.input,
    textPrimary: tokens.color.text.primary,
    textSecondary: tokens.color.text.secondary,
    textMuted: tokens.color.text.muted,
    ctaBackground: tokens.color.brand.yellow,
    ctaBackgroundPressed: tokens.color.brand.yellowPressed,
    ctaText: tokens.color.text.onYellow,
    border: tokens.color.border.default,
    borderEmphasis: tokens.color.border.emphasis,
    // Limite de CONTROLE (input, checkbox, toggle): o unico que passa 3:1 nos
    // quatro fundos. `border`/`borderEmphasis` sao decorativos e reprovam.
    borderControl: tokens.color.border.strong,
    success: tokens.color.semantic.success,
    danger: tokens.color.semantic.danger,
    // Preenchimento de erro (badge, DangerButton, toast). Texto branco por cima
    // so passa em AA sobre este, nunca sobre `danger`.
    dangerFill: tokens.color.semantic.dangerFill,
    warning: tokens.color.semantic.warning,
    info: tokens.color.semantic.info,
  },
} as const;

export type Tokens = typeof tokens;
export type Theme = typeof theme;
