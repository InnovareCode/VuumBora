/**
 * Tipos do domínio da candidatura de pré-cadastro de motorista (etapa 1 de
 * 2 — ver docs/decisoes-do-dono.md → "DECISÃO: duas etapas", 19/11/2026).
 * Espelham (em runtime, no backend) o contrato público documentado em
 * `packages/api-client/src/driver-applications`.
 *
 * Tabela própria (`driver_applications`), separada de `waitlist_signups`:
 * são públicos e fluxos diferentes (ver migração 0002).
 */

/** Já normalizados (trim, minúsculas no e-mail, E.164 no telefone, UF maiúscula) antes de chegar à camada de serviço. */
export interface DriverApplicationInput {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly city: string;
  readonly state: string;
  readonly alreadyDrivesForApp?: boolean | undefined;
  readonly hasOwnVehicle?: boolean | undefined;
}

/** Resultado interno — nunca repassado ao cliente HTTP (anti-enumeração: a resposta é sempre igual). */
export type DriverApplicationOutcome = 'created' | 'already_registered';

/**
 * Estado da candidatura. Hoje só `insertDriverApplication` escreve
 * (sempre `'pending'`, via DEFAULT do banco) — nenhum endpoint ou script
 * desta entrega lê ou altera. Existe só para a tabela não precisar de
 * outra migração quando o fluxo de aprovação for definido (quem analisa,
 * prazo, critério — pendência registrada em docs/decisoes-do-dono.md).
 */
export type DriverApplicationStatus = 'pending' | 'approved' | 'rejected';
