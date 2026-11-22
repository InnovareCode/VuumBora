import { Stack } from 'expo-router';
import { stackScreenOptions } from '../../src/navigation/stackScreenOptions';

/** Rotas públicas do motorista. `entrar` (M01) é a porta de entrada: criar conta, código e recuperação empilham sobre ela. */
export const unstable_settings = { anchor: 'entrar' };

export default function AuthLayout() {
  return <Stack screenOptions={stackScreenOptions} />;
}
