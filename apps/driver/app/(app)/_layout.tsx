import { Stack } from 'expo-router';
import { stackScreenOptions } from '../../src/navigation/stackScreenOptions';

/** Rotas do produto: só montadas com sessão (ver `Stack.Protected` em `app/_layout.tsx`). A Home é o `index`. */
export const unstable_settings = { anchor: 'index' };

export default function AppLayout() {
  return <Stack screenOptions={stackScreenOptions} />;
}
