import { memo, useCallback, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@vuumbora/tokens';
import { gradientColors, gradientLocations } from './gradient';
import { isFocusVisibleEvent, isOwnFocusEvent } from './linkKeyboard';
import { focusRingLayerStyle, NO_BROWSER_OUTLINE } from './useFocusRing';

const COMPACT_WIDTH_BREAKPOINT = 375;

const EDGES_WITH_FOOTER: readonly Edge[] = ['top', 'left', 'right'];
const EDGES_DEFAULT: readonly Edge[] = ['top', 'right', 'bottom', 'left'];

// Anel do contêiner de rolagem focado por teclado: 2pt para DENTRO da área rolável (ela encosta nas bordas da tela, um anel
// por fora sairia da janela), com o raio de um campo.
const SCROLL_FOCUS_RING = focusRingLayerStyle('inside', theme.radius.md);

const SCREEN_GLOW_COLORS = gradientColors(theme.gradient.screen);
const SCREEN_GLOW_LOCATIONS = gradientLocations(theme.gradient.screen);

export interface AppShellProps {
  readonly children: ReactNode;
  /** `true` quando o conteúdo pode exceder a tela (listas, formulários longos). */
  readonly scroll?: boolean;
  readonly padded?: boolean;
  /**
   * Brilho de topo (direção de arte §4/§9 item 6, `gradient.screen`) — só em telas com
   * cabeçalho na área escura (início, carteira, perfil). NUNCA em tela com mapa (o
   * brilho compete com o mapa por atenção e não foi medido sobre ele).
   */
  readonly glow?: boolean;
  /**
   * `true` quando o chamador desenha o próprio fundo (ex.: `OnboardingBackground` atrás
   * do `AppShell`, direção de arte §9 item 9) — omite o `backgroundColor:
   * theme.role.screen` opaco para a imagem aparecer por baixo. Nunca combinar com `glow`
   * (o brilho de topo é pensado para `theme.role.screen`, não para foto).
   */
  readonly transparent?: boolean;
  /** Slot fixo abaixo da área rolável (ex.: `BottomTabBar`) — nunca rola junto com `children`. */
  readonly footer?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** Moldura de tela: safe area + fundo `theme.role.screen` + padding padrão. Todo app parte daqui. */
export const AppShell = memo(function AppShell({
  children,
  scroll = false,
  padded = true,
  glow = false,
  transparent = false,
  footer,
  style,
  testID,
}: AppShellProps) {
  // §3 do padrão premium: margem lateral 16pt abaixo de 375pt de largura (`screenPaddingCompact`),
  // 20pt a partir daí (`screenPadding`) — o token compacto existia e ninguém usava (auditoria).
  const { width: windowWidth } = useWindowDimensions();
  const compact = windowWidth < COMPACT_WIDTH_BREAKPOINT;
  const scrollFocus = useScrollFocusRing();

  // Auditoria B1 (causa raiz do "scrim que acaba antes do fim da tela" nas boas-vindas):
  // com `scroll`, este wrapper NÃO crescia (`!scroll && styles.flexFill` nunca aplicava
  // flex a ele) — o `ScrollView.contentContainerStyle` já tinha `flexGrow:1`, mas isso só
  // estica o CONTAINER da rolagem; o filho único dentro dele (este `View`) só ocupa o
  // espaço quando ele mesmo também tem `flexGrow`. Sem isso, telas com `flex:1` no
  // próprio conteúdo (ex. `boas-vindas.tsx`) não tinham altura disponível pra crescer.
  const content = (
    <View
      style={[
        padded && (compact ? styles.paddedCompact : styles.padded),
        scroll ? styles.scrollFill : styles.flexFill,
        // §4 (PP-7, `layout.contentMaxWidth`): em tablet/tela grande o conteúdo não estica
        // além de 480pt — fica centrado, sem "buraco" de fundo entre ele e as bordas.
        styles.contentWidth,
        style,
      ]}
    >
      {children}
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.root, transparent && styles.rootTransparent]}
      testID={testID}
      edges={footer ? EDGES_WITH_FOOTER : EDGES_DEFAULT}
    >
      {glow ? (
        <LinearGradient
          colors={SCREEN_GLOW_COLORS}
          locations={SCREEN_GLOW_LOCATIONS}
          style={styles.glow}
          pointerEvents="none"
          testID={testID ? `${testID}-glow` : undefined}
        />
      ) : null}
      {scroll ? (
        // `handled`: com o teclado aberto, o 1º toque num botão/link ATIVA o botão (padrão `never` só fecharia o
        // teclado e exigiria um 2º toque — em formulário isso parece botão quebrado). `automaticallyAdjustKeyboardInsets`
        // (iOS) sobe o conteúdo acima do teclado; no Android quem faz isso é o `adjustResize` da janela.
        <ScrollView
          {...scrollFocus.scrollProps}
          // Sem o contorno `auto` do navegador por baixo da camada (quase preto, e metade fora da janela).
          style={scrollFocus.ring ? NO_BROWSER_OUTLINE : undefined}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
      {scroll && scrollFocus.ring ? (
        <View style={[styles.scrollFocusFrame, { top: scrollFocus.ring.y, height: scrollFocus.ring.height }]}>
          <View style={SCROLL_FOCUS_RING} />
        </View>
      ) : null}
      {footer}
    </SafeAreaView>
  );
});

interface ScrollFrame {
  readonly y: number;
  readonly height: number;
}

const NO_SCROLL_PROPS = {};

/**
 * Anel de foco do contêiner de rolagem (dívida da onda 4: P07, P07c, P08, M06). O Chromium torna focável por teclado o
 * contêiner rolável que não tem nenhum alvo focável dentro ("keyboard-focusable scrollers") — certo, é como quem usa
 * teclado rola com as setas. Mas o contorno dele é o `auto` do navegador, quase preto sobre o fundo escuro: o Tab
 * parava num lugar invisível.
 *
 * O anel NÃO é `outline` no próprio `ScrollView`: no react-native-web os filhos (mapa, cartões) são pintados por cima do
 * contorno do pai (mesma causa do anel do CTA, `focusRingLayerStyle`). Ele é uma camada irmã, DEPOIS da rolagem, na
 * posição e altura que o `onLayout` dela mediu — sem embrulhar a rolagem num `View` novo (o layout das telas não muda).
 * Só no web: fora dele não há foco de teclado de navegador e `scrollProps` fica vazio.
 */
function useScrollFocusRing() {
  const isWeb = Platform.OS === 'web';
  const frameRef = useRef<ScrollFrame | null>(null);
  const [ring, setRing] = useState<ScrollFrame | null>(null);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    frameRef.current = { y, height };
    setRing((current) => (current ? { y, height } : current));
  }, []);
  const onFocus = useCallback((event: unknown) => {
    if (isOwnFocusEvent(event) && isFocusVisibleEvent(event) && frameRef.current) setRing(frameRef.current);
  }, []);
  const onBlur = useCallback((event: unknown) => {
    if (isOwnFocusEvent(event)) setRing(null);
  }, []);

  const scrollProps = isWeb ? { onLayout, onFocus, onBlur } : NO_SCROLL_PROPS;
  return { ring: isWeb ? ring : null, scrollProps };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.role.screen },
  rootTransparent: { backgroundColor: 'transparent' },
  padded: { padding: theme.layout.screenPadding },
  paddedCompact: { padding: theme.layout.screenPaddingCompact },
  contentWidth: { width: '100%', maxWidth: theme.layout.contentMaxWidth, alignSelf: 'center' },
  flexFill: { flex: 1 },
  scrollFill: { flexGrow: 1 },
  scrollContent: { flexGrow: 1 },
  // Altura aproxima o alcance do radial medido (120% x 420px a partir do topo) —
  // ver $description de gradient.screen sobre a conversão linear.
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
  scrollFocusFrame: { position: 'absolute', left: 0, right: 0, pointerEvents: 'none' },
});
