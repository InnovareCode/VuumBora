import { useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { MOCK_SAVED_PLACES } from '../data/mockPlaces';
import { useRideRequestStore } from '../store/useRideRequestStore';
import { devSampleOrigin } from './devGeo';

/**
 * SÓ `__DEV__`: monta o trajeto quando a P05/P06 é aberta DIRETO (`?devSeed=1`), sem passar pela P03/P04 — é o que a
 * ferramenta `tools/qualidade-tela` usa para capturar essas telas sem clicar o fluxo inteiro. Mesmo padrão do
 * `?devCenario=` do motorista: parâmetro só em desenvolvimento, nunca lido fora daqui.
 *
 * Fatia G6: a origem não tem mais padrão na store (vem da posição do aparelho), então o atalho monta os DOIS pontos
 * (`setRoute`, uma cotação só): a origem de exemplo do cenário `?devLocal=ok` e o 3º lugar salvo de exemplo. O preço,
 * a rota e as categorias saem da cotação do mock do contrato, como no fluxo real.
 */
export function useDevRideSeed() {
  const { devSeed } = useLocalSearchParams<{ devSeed?: string }>();
  const destination = useRideRequestStore((state) => state.destination);
  const setRoute = useRideRequestStore((state) => state.setRoute);

  useEffect(() => {
    if (!__DEV__ || devSeed !== '1' || destination) return;
    const sampleDestination = MOCK_SAVED_PLACES[2]; // "Shopping Midway Mall" — perto do exemplo da prancha
    if (sampleDestination) setRoute(useRideRequestStore.getState().origin ?? devSampleOrigin(), sampleDestination);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devSeed, destination]);
}
