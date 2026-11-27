import { useCallback, useEffect } from 'react';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { parseDevScenario } from './devScenarios';
import { ensureOnboardingLoaded, refreshOnboarding, useOnboardingStore, type OnboardingView } from './onboardingStore';

export interface UseOnboardingResult {
  readonly view: OnboardingView;
  readonly refreshing: boolean;
  readonly refresh: () => Promise<void>;
}

/**
 * O estado do cadastro para uma TELA: garante a leitura ao montar e relê toda vez que a tela volta ao topo da pilha
 * (o revisor pode ter decidido algo enquanto o motorista estava em outra tela — o estado é do servidor, não do app).
 * `?devCenario=` (só `__DEV__`) escolhe um estado de desenvolvimento; ver `devScenarios.ts`.
 */
export function useOnboarding(): UseOnboardingResult {
  const { devCenario } = useLocalSearchParams<{ devCenario?: string }>();
  const scenario = parseDevScenario(devCenario);
  const view = useOnboardingStore((state) => state.view);
  const refreshing = useOnboardingStore((state) => state.refreshing);

  useEffect(() => {
    void ensureOnboardingLoaded(scenario);
  }, [scenario]);

  useFocusEffect(
    useCallback(() => {
      // Só relê o que já foi lido uma vez: a primeira leitura é do efeito acima (com o cenário, se houver).
      if (useOnboardingStore.getState().view.status !== 'idle') void refreshOnboarding();
    }, []),
  );

  return { view, refreshing, refresh: refreshOnboarding };
}
