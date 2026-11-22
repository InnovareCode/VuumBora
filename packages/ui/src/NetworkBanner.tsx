import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '@vuumbora/tokens';
import { withAlpha } from './colorAlpha';
import { textStyle } from './typography';
import { useNetworkStatus } from './useNetworkStatus';

export interface NetworkBannerProps {
  readonly testID?: string;
}

/**
 * Faixa de "sem rede" (C-01, §12): fixa no topo, abaixo da safe area — quem posiciona é
 * quem chama (normalmente primeiro filho do conteúdo do `AppShell`). `role.warning`
 * tingido (nunca cor sozinha: tem texto). Não renderiza nada quando online — a tela nunca
 * reserva espaço vazio para ela.
 *
 * Medido de verdade em 22/11/2026 (`context.setOffline` do Playwright): funciona no
 * WebKit, mas NÃO aparece no Chromium headless — não é bug daqui. O Chromium expõe
 * `navigator.connection` (Network Information API); quando esse objeto existe, o
 * `@react-native-community/netinfo` escuta `connection.addEventListener('change', …)` em
 * vez de `window.addEventListener('online'/'offline', …)`, e `context.setOffline()` do
 * Playwright só dispara o segundo (confirmado: `navigator.onLine` muda e o evento
 * `offline` do `window` dispara normalmente nos dois motores). WebKit não tem
 * `navigator.connection`, por isso só lá o caminho medido bate com o caminho real do
 * componente. Em aparelho (iOS/Android, sem DOM) o NetInfo usa o módulo nativo de verdade
 * — nenhum dos dois caminhos web se aplica, e isso continua sem prova em aparelho.
 */
export const NetworkBanner = memo(function NetworkBanner({ testID }: NetworkBannerProps) {
  const online = useNetworkStatus();
  if (online) return null;
  return (
    <View style={styles.root} testID={testID} role="status" accessibilityLiveRegion="polite">
      <Text style={styles.text} numberOfLines={2}>
        Sem conexão. Tentando reconectar…
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    backgroundColor: withAlpha(theme.role.warning, 0.14),
    borderBottomWidth: 1,
    borderBottomColor: theme.role.warning,
    paddingVertical: theme.spacing['2'],
    paddingHorizontal: theme.layout.screenPadding,
  },
  text: { color: theme.role.warning, ...textStyle('semibold', 'small'), textAlign: 'center' },
});
