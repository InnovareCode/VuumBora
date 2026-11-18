/**
 * @vuumbora/domain — núcleo compartilhado (shared kernel).
 *
 * Só entra aqui o que é IGUAL para passageiro e motorista: identificadores, dinheiro,
 * localização e o status canônico da corrida (controlado pelo backend).
 * Regras de cada perfil ficam em `@vuumbora/domain/passenger` e `@vuumbora/domain/driver`
 * — um app nunca importa o subcaminho do outro (checado por scripts/check-boundaries.mjs).
 *
 * Sem React, sem React Native, sem I/O: apenas tipos e funções puras.
 */

/** Identificador opaco (UUID emitido pelo backend). O "brand" impede trocar TripId por UserId. */
export type Id<Tag extends string> = string & { readonly __brand: Tag };
export type UserId = Id<'User'>;
export type DriverId = Id<'Driver'>;
export type TripId = Id<'Trip'>;

/** Instante sempre com fuso explícito (ISO 8601 com offset, ex.: 2026-11-18T09:00:00-03:00). */
export type IsoDateTime = string & { readonly __brand: 'IsoDateTime' };

/** Dinheiro: centavos inteiros em BRL. Nunca float como fonte de verdade. */
export interface Money {
  readonly amountCents: number;
  readonly currency: 'BRL';
}

/**
 * Origem do dado exibido. Todo dado de demonstração carrega `mock` até a tela —
 * a UI é obrigada a sinalizar (DESIGN_SYSTEM_MESTRE §9/§10).
 */
export type DataOrigin = 'mock' | 'real';

export interface Sourced<T> {
  readonly data: T;
  readonly origin: DataOrigin;
}

export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
  /** Precisão em metros, quando o SO informar. */
  readonly accuracyM?: number;
}

export interface Place {
  readonly label: string;
  readonly address: string;
  readonly point: GeoPoint;
}

/**
 * Status canônico da corrida no servidor. Transições são decididas pelo backend
 * (idempotência + auditoria); os apps apenas projetam este status em fases próprias.
 * Proposta inicial — a ser confirmada no contrato de backend (Etapa E).
 */
export type TripStatus =
  | 'requested'
  | 'searching_driver'
  | 'driver_assigned'
  | 'driver_en_route'
  | 'driver_arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type PaymentStatus = 'pending' | 'authorized' | 'declined' | 'refunded';
