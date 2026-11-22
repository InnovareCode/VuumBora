import { router, type Href } from 'expo-router';

/**
 * Voltar de verdade: se não há para onde voltar (URL aberta direto no web, deep link no nativo), `router.back()` não
 * faz nada e a pessoa fica presa na tela. Cai na rota indicada.
 */
export function goBackOr(fallback: Href): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace(fallback);
  }
}
