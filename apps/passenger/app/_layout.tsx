import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { theme } from '@vuumbora/ui';

/**
 * Layout raiz (Expo Router). Grupos previstos, ainda não criados:
 *   (auth)/  — rotas públicas
 *   (app)/   — rotas autenticadas, protegidas por Stack.Protected
 * Telas: fora do escopo da fundação.
 *
 * SafeAreaProvider entra aqui porque `AppShell` (@vuumbora/ui) usa SafeAreaView
 * por baixo — sem o provider as insets ficam zeradas.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.role.screen } }} />
    </SafeAreaProvider>
  );
}
