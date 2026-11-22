import { Stack } from 'expo-router';
import { stackScreenOptions } from '../../src/navigation/stackScreenOptions';

/** Rotas públicas do motorista. `entrar` é a porta de entrada (M01 ainda não existe — ver a tela). */
export const unstable_settings = { anchor: 'entrar' };

export default function AuthLayout() {
  return <Stack screenOptions={stackScreenOptions} />;
}
