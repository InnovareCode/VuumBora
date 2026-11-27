import { createMockDriverRidePort, type DriverTripPort, type MockDriverRide } from '@vuumbora/api-client/driver';
import type { Place, TripId } from '@vuumbora/domain';

/**
 * Cliente mock da corrida do motorista (onda 4, M06-M10) — singleton do MÓDULO (sobrevive à
 * navegação client-side entre `/oferta` → `/corrida` → `/finalizada`, reseta a cada `page.goto`
 * de verdade, igual à sessão de identidade). Existe só para o PIN de embarque (D-12) ter uma
 * fonte REAL por trás (`DriverTripPort.start`) — nenhuma outra ação do app chama este cliente
 * ainda (pendência para quem ligar a API de verdade).
 */

export const MOCK_TRIP_ID = 'onda4-mock-trip' as TripId;

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

/** Código fixo (não aleatório) para o roteiro de prova poder errar de propósito (`?devEstado=codigo-errado`). */
const MOCK_PICKUP_CODE = '0000';

let ride: MockDriverRide | null = null;
let assigned: Promise<void> | null = null;

function getRide(): MockDriverRide {
  if (!ride) ride = createMockDriverRidePort({ nextPickupCode: () => MOCK_PICKUP_CODE });
  return ride;
}

/**
 * Garante que `MOCK_TRIP_ID` existe e está ATRIBUÍDO a este motorista (`driver_en_route`) —
 * idempotente e seguro para chamar de qualquer tela/efeito quantas vezes precisar. A 1ª chamada
 * cria a oferta e aceita; as seguintes são no-op (a promise já resolvida é reaproveitada, nunca
 * uma 2ª oferta/aceite na mesma corrida).
 */
export function ensureAssignedTrip(): Promise<void> {
  if (!assigned) {
    const port = getRide();
    const offer = port.control.offer({
      tripId: MOCK_TRIP_ID,
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
