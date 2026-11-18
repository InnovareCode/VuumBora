import { memo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@vuumbora/tokens';

export interface AppShellProps {
  readonly children: ReactNode;
  /** `true` quando o conteúdo pode exceder a tela (listas, formulários longos). */
  readonly scroll?: boolean;
  readonly padded?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** Moldura de tela: safe area + fundo `theme.role.screen` + padding padrão. Todo app parte daqui. */
export const AppShell = memo(function AppShell({ children, scroll = false, padded = true, style, testID }: AppShellProps) {
  const content = <View style={[padded && styles.padded, !scroll && styles.flexFill, style]}>{children}</View>;

  return (
    <SafeAreaView style={styles.root} testID={testID}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.role.screen },
  padded: { padding: theme.layout.screenPadding },
  flexFill: { flex: 1 },
  scrollContent: { flexGrow: 1 },
});
