import { createMockDriverRidePort, type DriverTripPort, type MockDriverRide } from '@vuumbora/api-client/driver';
import type { Place, TripId } from '@vuumbora/domain';

/**
 * Cliente mock da corrida do motorista (onda 4, M06-M10) — singleton do MÓDULO (sobrevive à
 * navegação client-side entre `/oferta` → `/corrida` → `/finalizada`, reseta a cada `page.goto`
 * de verdade, igual à sessão de identidade). Existe só para o PIN de embarque (D-12) ter uma
 * fonte REAL por trás (`DriverTripPort.start`) — nenhuma outra ação do app chama este cliente
 * ainda (pendência para quem ligar a API de verdade).
 */

const MOCK_PICKUP: Place = {
  label: 'Av. Prudente de Morais, 1200',
  address: 'Av. Prudente de Morais, 1200',
  neighborhood: 'Lagoa Nova',
  point: { latitude: -5.796, longitude: -35.211 },
};

const MOCK_DESTINATION: Place = {
  label: 'Shopping Midway Mall',
  address: 'Av. Bernardo Vieira, 1030',
  neighborhood: 'Tirol',
  point: { latitude: -5.805, longitude: -35.205 },
};

/**
 * Código fixo (não aleatório, para o roteiro de prova poder errar de propósito com
 * `?devEstado=codigo-errado`). O PLACEHOLDER do campo vazio é que muda (`corrida.tsx` passa
 * `placeholder="••••"` ao `CodeInput`) — o padrão dele é `'0'.repeat(length)` = "0000", IGUAL a
 * este código (achado real da Íris: o campo vazio parecia estar "sugerindo" a resposta certa).
 */
const MOCK_PICKUP_CODE = '0000';

let ride: MockDriverRide | null = null;
/** Id da corrida ATUAL — muda a cada nova oferta (`startNewOfferCycle`), nunca fixo entre sessões. */
let currentTripId: TripId = generateTripId();
/** `null` = ninguém pediu a atribuição ainda para `currentTripId`; some quando um novo ciclo começa. */
let assigned: Promise<void> | null = null;

function generateTripId(): TripId {
  return `onda4-trip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` as TripId;
}

function getRide(): MockDriverRide {
  if (!ride) ride = createMockDriverRidePort({ nextPickupCode: () => MOCK_PICKUP_CODE });
  return ride;
}

/**
 * Começa um ciclo de oferta NOVO (M06 de verdade, ao montar): troca `currentTripId` e esquece a
 * atribuição anterior. Sem isto, uma 2ª corrida na MESMA sessão (ex.: terminar uma, voltar à M05 e
 * receber outra oferta) reusava o `tripId` da primeira — já `completed`/`in_progress` no mock — e
 * tudo que viesse depois (`arrived`/`start`) quebrava com `409`/`404` silenciosos. Idempotente por
 * chamada: cada `/oferta` nova monta o componente uma vez, chama isto uma vez.
 */
export function startNewOfferCycle(): TripId {
  currentTripId = generateTripId();
  assigned = null;
  return currentTripId;
}

export function getCurrentTripId(): TripId {
  return currentTripId;
}

/**
 * Garante que a corrida ATUAL existe e está ATRIBUÍDA a este motorista (`driver_en_route`) —
 * idempotente e seguro para chamar de qualquer tela/efeito quantas vezes precisar DENTRO do MESMO
 * ciclo de oferta. A 1ª chamada cria a oferta e aceita; as seguintes reaproveitam a mesma promise
 * (nunca uma 2ª oferta/aceite para o mesmo `tripId`).
 */
export function ensureAssignedTrip(): Promise<void> {
  if (!assigned) {
    const port = getRide();
    const offer = port.control.offer({
      tripId: currentTripId,
      pickup: MOCK_PICKUP,
      destination: MOCK_DESTINATION,
      categoryId: 'vuumbora',
      estimatedPayout: { amountCents: 1890, currency: 'BRL' },
      pickupDistanceM: 1800,
      pickupEtaS: 360,
      tripDistanceM: 4800,
      tripDurationS: 720,
      passengerFirstName: 'Ana',
    });
    assigned = port.offerPort.accept(offer, newIdempotencyKey()).then(() => undefined);
  }
  return assigned;
}

export function getDriverTripPort(): DriverTripPort {
  return getRide().tripPort;
}

/** Nunca reusar a mesma chave entre tentativas (cada tentativa de código é uma ação nova). */
export function newIdempotencyKey(): string {
  return `onda4-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
