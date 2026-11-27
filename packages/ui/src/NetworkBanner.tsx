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
 * Web: até 27/11/2026 a faixa NÃO aparecia no Chromium com um corte que só dispara o
 * `offline` do `window` (o `context.setOffline()` do Playwright, por exemplo) — o NetInfo lá
 * escuta só `navigator.connection`. O `useNetworkStatus` agora soma os eventos do próprio
 * navegador (`browserOnline.ts`), e a faixa aparece nos dois motores. Em aparelho
 * (iOS/Android, sem DOM) vale só o módulo nativo do NetInfo — continua sem prova em aparelho.
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
