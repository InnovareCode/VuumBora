/**
 * Tipos do domínio da lista de espera. Espelham (em runtime, no backend)
 * o contrato público documentado em `packages/api-client/src/waitlist`.
 */

export type WaitlistProfile = 'passenger' | 'driver';

export interface WaitlistSignupInput {
  /** Já normalizado (minúsculas, sem espaços) antes de chegar à camada de serviço. */
  readonly email: string;
  readonly profile?: WaitlistProfile;
}

/** Resultado interno — nunca repassado ao cliente HTTP (anti-enumeração: a resposta é sempre igual). */
export type WaitlistSignupOutcome = 'created' | 'already_registered';
