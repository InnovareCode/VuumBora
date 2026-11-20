/**
 * Contrato fixo combinado com Vega para esta entrega (ver briefing da tarefa).
 * Campos exatos da candidatura — etapa 1 de 2. Documento, veículo e endereço
 * são a etapa 2 e NÃO existem ainda: não adicionamos campo nem placeholder
 * para eles aqui.
 */

export type DriverApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface DriverApplication {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly city: string;
  readonly state: string;
  readonly alreadyDrivesForApp: boolean | null;
  readonly hasOwnVehicle: boolean | null;
  readonly status: DriverApplicationStatus;
  readonly source: string;
  readonly createdAt: string;
}

export interface DriverApplicationSummary {
  readonly pending: number;
  readonly approved: number;
  readonly rejected: number;
}

export interface DriverApplicationListParams {
  readonly status?: DriverApplicationStatus | undefined;
  readonly q?: string | undefined;
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
}

export interface DriverApplicationListResult {
  readonly items: readonly DriverApplication[];
  readonly nextCursor: string | null;
}

/**
 * Mesmo vocabulário de `AdminRole` em `apps/api/src/domain/admin.ts` — espelho
 * manual (o admin é SPA separado, não importa código da API). Se a API
 * acrescentar/renomear um papel, este union muda junto.
 */
export type AdminRole = 'dono' | 'operacao' | 'revisor_documentos' | 'financeiro' | 'suporte';

export interface AdminUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: AdminRole;
}

export interface AdminLoginInput {
  readonly email: string;
  readonly password: string;
}
