import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { theme } from '@vuumbora/ui';

/**
 * Layout raiz (Expo Router). Grupos previstos, ainda não criados:
 *   (auth)/  — rotas públicas
 *   (app)/   — rotas autenticadas, protegidas por Stack.Protected
 * Telas: fora do escopo da fundação.
 */
export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.role.screen } }} />
    </>
  );
}
