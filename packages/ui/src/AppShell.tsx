import { memo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@vuumbora/tokens';
import { gradientColors, gradientLocations } from './gradient';

const COMPACT_WIDTH_BREAKPOINT = 375;

const EDGES_WITH_FOOTER: readonly Edge[] = ['top', 'left', 'right'];
const EDGES_DEFAULT: readonly Edge[] = ['top', 'right', 'bottom', 'left'];

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
      {footer}
    </SafeAreaView>
  );
});

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
});
