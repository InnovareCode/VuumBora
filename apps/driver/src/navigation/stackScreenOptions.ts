import type { ComponentProps } from 'react';
import type { Stack } from 'expo-router';
import { theme } from '@vuumbora/ui';

/** Opções comuns aos três `Stack` do app (raiz, `(auth)` e `(app)`): sem cabeçalho nativo, fundo da marca. */
export const stackScreenOptions: NonNullable<ComponentProps<typeof Stack>['screenOptions']> = {
  headerShown: false,
  contentStyle: { backgroundColor: theme.role.screen },
};
