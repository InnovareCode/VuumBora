import { memo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { theme } from '@vuumbora/tokens';

const EDGES_WITH_FOOTER: readonly Edge[] = ['top', 'left', 'right'];
const EDGES_DEFAULT: readonly Edge[] = ['top', 'right', 'bottom', 'left'];

export interface AppShellProps {
  readonly children: ReactNode;
  /** `true` quando o conteúdo pode exceder a tela (listas, formulários longos). */
  readonly scroll?: boolean;
  readonly padded?: boolean;
  /** Slot fixo abaixo da área rolável (ex.: `BottomTabBar`) — nunca rola junto com `children`. */
  readonly footer?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** Moldura de tela: safe area + fundo `theme.role.screen` + padding padrão. Todo app parte daqui. */
export const AppShell = memo(function AppShell({ children, scroll = false, padded = true, footer, style, testID }: AppShellProps) {
  const content = <View style={[padded && styles.padded, !scroll && styles.flexFill, style]}>{children}</View>;

  return (
    <SafeAreaView style={styles.root} testID={testID} edges={footer ? EDGES_WITH_FOOTER : EDGES_DEFAULT}>
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
});
