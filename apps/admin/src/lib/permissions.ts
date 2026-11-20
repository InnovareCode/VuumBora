import type { AdminRole } from '../api/types';

/**
 * Mesmos papéis que a rota de decisão (`approve`/`reject`) exige no backend
 * — pareado por comentário, igual já é feito em `nav/adminNav.ts` para a
 * visibilidade do menu. Isto é usabilidade (não oferecer um botão que o
 * próprio papel não pode usar); quem protege de verdade é o 403 do servidor.
 */
const DRIVER_APPLICATION_DECISION_ROLES: readonly AdminRole[] = ['dono', 'operacao'];

export function canDecideDriverApplications(role: AdminRole | null | undefined): boolean {
  return !!role && DRIVER_APPLICATION_DECISION_ROLES.includes(role);
}
