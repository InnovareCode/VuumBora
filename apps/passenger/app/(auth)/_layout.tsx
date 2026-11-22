import { Stack } from 'expo-router';
import { stackScreenOptions } from '../../src/navigation/stackScreenOptions';

/** Rotas públicas do passageiro. A P01 é a porta de entrada: login e cadastro empilham sobre ela. */
export const unstable_settings = { anchor: 'boas-vindas' };

export default function AuthLayout() {
  return <Stack screenOptions={stackScreenOptions} />;
}
