import { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MOCK_SAVED_PLACES } from '../data/mockPlaces';
import { useRideRequestStore } from '../store/useRideRequestStore';

/**
 * SÓ `__DEV__`: popula o destino (a origem já tem padrão na store, `MOCK_CURRENT_LOCATION`)
 * quando a P05/P06 é aberta DIRETO, sem passar pela Home/P04 antes — necessário para a
 * ferramenta de qualidade de tela (`tools/qualidade-tela`) capturar o estado "padrão" dessas
 * telas sem clicar o fluxo inteiro a cada captura. Mesmo padrão já usado pela M05
 * (`?devAprovado=false`, `apps/driver/app/(app)/index.tsx`): parâmetro só em desenvolvimento,
 * removido do bundle de produção pelo Metro (`__DEV__`), nunca lido fora daqui.
 *
 * Definir o destino já dispara `refreshQuote()` sozinho (`setDestination` na store) — a
 * categoria é escolhida pela MESMA regra de sempre (1ª da cotação), não por este hook.
 */
export function useDevRideSeed() {
  const { devSeed } = useLocalSearchParams<{ devSeed?: string }>();
  const destination = useRideRequestStore((state) => state.destination);
  const setDestination = useRideRequestStore((state) => state.setDestination);

  useEffect(() => {
    if (!__DEV__ || devSeed !== '1' || destination) return;
    const fallbackDestination = MOCK_SAVED_PLACES[2]; // "Shopping Midway Mall" — perto do exemplo da prancha
    if (fallbackDestination) setDestination(fallbackDestination);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devSeed, destination]);
}
