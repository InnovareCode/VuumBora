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
import { SessionProvider, useSession } from '../src/session/SessionProvider';
import { stackScreenOptions } from '../src/navigation/stackScreenOptions';

/**
 * Layout raiz (Expo Router). Três grupos de rota:
 *   (auth)/  — rotas públicas (hoje só `entrar`, o acesso de demonstração): só existem SEM sessão.
 *   (app)/   — rotas do produto (dashboard M05): só existem COM sessão.
 *   mapbox-check — tela de desenvolvimento, fora dos grupos e FORA DO BUILD DE PRODUÇÃO (ver
 *              `metro.config.js`, variável VUUMBORA_BUILD_PROFILE).
 *
 * A guarda é `Stack.Protected`: com `guard` falso a tela nem é registrada no navegador, então
 * URL direta (web) ou deep link (nativo) para uma rota de `(app)` sem sessão nunca a abre e é
 * mandada para `redirectTo` (`entrar`). O `redirectTo` é explícito de propósito: sem ele o padrão
 * é a âncora do navegador raiz, que é o GRUPO `(auth)` — a URL vira `/(auth)`, que não é rota
 * ("Unmatched Route", medido no export web do passageiro em 21/11/2026). Mesma lógica no sentido
 * contrário: com sessão, `/entrar` manda para o dashboard.
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

function RootNavigator() {
  const { isSignedIn } = useSession();

  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Protected guard={!isSignedIn} redirectTo="/">
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={isSignedIn} redirectTo="/entrar">
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

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
      <SessionProvider>
        <RootNavigator />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
