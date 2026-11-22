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

/** Um stop de gradiente linear (cor + posição 0–1), consumido por expo-linear-gradient. */
export interface GradientStop {
  readonly color: string;
  readonly position: number;
}
function gradients<G extends { readonly [key: string]: Token<readonly GradientStop[]> }>(
  group: G
): { readonly [K in keyof G]: readonly GradientStop[] } {
  const out: Record<string, readonly GradientStop[]> = {};
  for (const [key, token] of Object.entries(group)) out[key] = token.$value;
  return out as { readonly [K in keyof G]: readonly GradientStop[] };
}

/**
 * Formato aceito diretamente pela prop de estilo `boxShadow` do React Native 0.88
 * (`ReadonlyArray<BoxShadowValue>` — ver node_modules/react-native/Libraries/StyleSheet/StyleSheetTypes.js).
 * Guardamos os tokens já nesse formato para não ter que serializar/parsear string CSS.
 */
export interface BoxShadowValue {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly color?: string;
  readonly blurRadius?: number;
  readonly spreadDistance?: number;
  readonly inset?: boolean;
}

function shadows<G extends { readonly [key: string]: Token<readonly BoxShadowValue[]> }>(
  group: G
): { readonly [K in keyof G]: readonly BoxShadowValue[] } {
  const out: Record<string, readonly BoxShadowValue[]> = {};
  for (const [key, token] of Object.entries(group)) out[key] = token.$value;
  return out as { readonly [K in keyof G]: readonly BoxShadowValue[] };
}

/** Curva de animação no formato `cubic-bezier(x1,y1,x2,y2)` (PP-7, `motion.easing.*`). */
export type CubicBezier = readonly [number, number, number, number];
function easingCurves<G extends { readonly [key: string]: Token<readonly number[]> }>(
  group: G,
  path: string
): { readonly [K in keyof G]: CubicBezier } {
  const out: Record<string, CubicBezier> = {};
  for (const [key, token] of Object.entries(group)) {
    const value = token.$value;
    if (value.length !== 4) {
      throw new Error(`[tokens] cubicBezier inválido em ${path}.${key}: esperado 4 números, recebeu ${value.length}`);
    }
    out[key] = value as unknown as CubicBezier;
  }
  return out as { readonly [K in keyof G]: CubicBezier };
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
    // Cores de apoio da direção de arte (docs/direcao-de-arte.md §4): rim light do
    // CTA e halo do card selecionado — translúcidas, usadas só dentro de `boxShadow`.
    highlight: colors(raw.color.highlight),
    // Superfícies translúcidas SEM blur (chip sobre mapa/foto, tab bar) — ver §5
    // do mesmo doc sobre por que não usamos expo-blur.
    overlay: colors(raw.color.overlay),
    semantic: colors(raw.color.semantic),
    map: colors(raw.color.map),
    // PP-7 (docs/padrao-premium-telas.md §4): pastilha atrás de ícone amarelo de atalho.
    tint: colors(raw.color.tint),
    // PP-7: gráfico de ganhos (M11) — barra ativa/inativa/mock, grade e rótulo de eixo.
    chart: colors(raw.color.chart),
  },
  spacing: dimensions(raw.spacing, 'spacing'),
  radius: dimensions(raw.radius, 'radius'),
  typography: {
    // Grupo, não string única: fonte estática (RN/Android) exige um fontFamily por
    // peso — não dá pra variar peso dentro de uma família só. Ver docs/tipografia.md.
    family: colors(raw.typography.family),
    size: dimensions(raw.typography.size, 'typography.size'),
    weight: fontWeights(raw.typography.weight),
  },
  layout: dimensions(raw.layout, 'layout'),
  opacity: numbers(raw.opacity),
  // Direção de arte §4 (docs/direcao-de-arte.md): gradiente para expo-linear-gradient,
  // sombra/halo prontos para a prop `boxShadow` do RN 0.88 (ver BoxShadowValue acima).
  gradient: gradients(raw.gradient),
  elevation: shadows(raw.elevation),
  glow: shadows(raw.glow),
  // PP-7 (docs/padrao-premium-telas.md §7/§4): movimento sem número mágico.
  motion: {
    duration: numbers(raw.motion.duration),
    easing: easingCurves(raw.motion.easing, 'motion.easing'),
  },
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
    // Texto sobre fundo CLARO não-CTA (gradient.searchLight) — mesma cor que ctaText
    // (navy), nome diferente porque o papel é outro (pílula de busca, não botão).
    textOnLight: tokens.color.text.onYellow,
    textOnLightMuted: tokens.color.text.onLightMuted,
    border: tokens.color.border.default,
    borderEmphasis: tokens.color.border.emphasis,
    // Limite de CONTROLE (input, checkbox, toggle): o unico que passa 3:1 nos
    // quatro fundos. `border`/`borderEmphasis` sao decorativos e reprovam.
    borderControl: tokens.color.border.strong,
    // Borda iluminada de cima (direção de arte §4/§9 item 2, "top-lit edge"): todo
    // card/campo/botão secundário usa borderTopColor=edgeTop e borderColor (demais
    // lados)=edgeBottom. edgeTop reaproveita borderEmphasis — luz vem do mesmo tom.
    edgeTop: tokens.color.border.emphasis,
    edgeBottom: tokens.color.border.subtle,
    // Direção de arte §4/§9 item 6/7: superfícies translúcidas SEM blur (ver §5 do doc).
    tabBarSurface: tokens.color.overlay.tabBar,
    glassOnMap: tokens.color.overlay.glassOnMap,
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
