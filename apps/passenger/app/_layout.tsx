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
 *   (auth)/  — rotas públicas (boas-vindas, login, cadastro, código, esqueci/redefinir senha, termos e
 *              privacidade): só existem SEM sessão.
 *   (app)/   — rotas do produto (home, corrida, histórico, perfil): só existem COM sessão.
 *   (dev)/   — telas de desenvolvimento (`/catalogo`, `/mapbox-check`; o grupo não entra na URL).
 *              Tudo sob `app/(dev)/` fica FORA DO BUILD DE PRODUÇÃO por convenção de pasta (ver
 *              `metro.config.js`): tela de desenvolvimento nova nasce AQUI, nunca solta em `app/`.
 *
 * A guarda é `Stack.Protected`: com `guard` falso a tela nem é registrada no navegador, então
 * URL direta (web) ou deep link (nativo) para uma rota de `(app)` sem sessão nunca a abre e é
 * mandada para `redirectTo` (P01). O `redirectTo` é explícito de propósito: sem ele o padrão é a
 * âncora do navegador raiz, que é o GRUPO `(auth)` — a URL vira `/(auth)`, que não é rota
 * ("Unmatched Route", medido no export web em 21/11/2026). Mesma lógica no sentido contrário:
 * com sessão, `/login` e `/cadastro` mandam para a Home.
 *
 * SafeAreaProvider entra aqui porque `AppShell` (@vuumbora/ui) usa SafeAreaView
 * por baixo — sem o provider as insets ficam zeradas. A sessão é a do cliente de identidade
 * (`src/identity/identityClient.ts`), não mais um estado de demonstração.
 *
 * Fonte da marca (Plus Jakarta Sans, 4 TTF estáticos — docs/tipografia.md): carrega
 * ANTES de qualquer tela aparecer. Sem isso, o primeiro frame sai na fonte do
 * sistema e "pisca" pra marca (FOUT) — pior ainda, é exatamente essa troca de
 * métrica que causa layout diferente entre máquinas (ver investigação do corte em
 * 390px). `SplashScreen` segura a tela nativa até o `useFonts` resolver.
 */
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { isSignedIn } = useSession();

  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Protected guard={!isSignedIn} redirectTo="/">
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={isSignedIn} redirectTo="/boas-vindas">
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

/**
 * Só monta a navegação quando a fonte da marca E a sessão estão resolvidas. A sessão sai de `loading` quando o
 * cliente de identidade termina de ler o cofre (memória hoje, SecureStore na A3). Antes disso a splash nativa
 * continua na tela: montar o `Stack` cedo faria a guarda decidir com a sessão ainda desconhecida e piscar a P01.
 */
function RootGate({ fontsLoaded }: { readonly fontsLoaded: boolean }) {
  const { status } = useSession();
  const ready = fontsLoaded && status !== 'loading';

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  if (!ready) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  // O provider fica FORA do portão da fonte: a leitura do cofre começa em paralelo ao carregamento da fonte.
  return (
    <SessionProvider>
      <RootGate fontsLoaded={fontsLoaded} />
    </SessionProvider>
  );
}
