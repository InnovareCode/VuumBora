import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { theme } from '@vuumbora/ui';

/**
 * Layout raiz (Expo Router). Grupos previstos, ainda não criados:
 *   (auth)/  — rotas públicas
 *   (app)/   — rotas autenticadas, protegidas por Stack.Protected
 * Telas: fora do escopo da fundação.
 *
 * SafeAreaProvider entra aqui porque `AppShell` (@vuumbora/ui) usa SafeAreaView por
 * baixo — sem o provider as insets ficam zeradas (adicionado na M05, mesma razão do
 * passageiro).
 *
 * Fonte da marca (Plus Jakarta Sans, 4 TTF estáticos — docs/tipografia.md), mesma
 * carga que o app Passageiro: `@vuumbora/ui` é compartilhada, então os dois apps
 * precisam da fonte carregada ANTES de qualquer Text renderizar.
 */
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.role.screen } }} />
    </SafeAreaProvider>
  );
}
