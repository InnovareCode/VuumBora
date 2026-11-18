import { memo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@vuumbora/tokens';
import { gradientColors, gradientLocations } from './gradient';

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
  /** Slot fixo abaixo da área rolável (ex.: `BottomTabBar`) — nunca rola junto com `children`. */
  readonly footer?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** Moldura de tela: safe area + fundo `theme.role.screen` + padding padrão. Todo app parte daqui. */
export const AppShell = memo(function AppShell({ children, scroll = false, padded = true, glow = false, footer, style, testID }: AppShellProps) {
  const content = <View style={[padded && styles.padded, !scroll && styles.flexFill, style]}>{children}</View>;

  return (
    <SafeAreaView style={styles.root} testID={testID} edges={footer ? EDGES_WITH_FOOTER : EDGES_DEFAULT}>
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
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
  padded: { padding: theme.layout.screenPadding },
  flexFill: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  // Altura aproxima o alcance do radial medido (120% x 420px a partir do topo) —
  // ver $description de gradient.screen sobre a conversão linear.
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
});
