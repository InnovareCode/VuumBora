import type { AdminRole } from '../api/types';
import { DOCUMENT_REVIEW_ROLES } from '../api/documentReviewTypes';

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

/**
 * Espelha `requireAdminRole('dono')` em `apps/api/src/routes/admin-user-route.ts` — a gestão de usuários e papéis é
 * só do `dono`. O backend devolve 403 para os demais; isto só evita oferecer uma tela que o papel não abre.
 */
export function canManageAdminUsers(role: AdminRole | null | undefined): boolean {
  return role === 'dono';
}

/**
 * Espelha `roleRequiresTwoFactor` em `apps/api/src/domain/two-factor.ts`: o servidor só exige (e checa) o TOTP de
 * quem está chamando quando o papel ENVOLVIDO na mutação (criar/promover, ou o papel ATUAL ao reativar) é
 * `dono`/`financeiro` (revisão S1 rodada 3g, ponto 3 de docs/contrato-admin-usuarios.md). A tela usa isto só para
 * decidir se mostra o campo de código — quem protege de verdade é o 401 `invalid_second_factor` do servidor.
 */
export function roleRequiresSecondFactorGate(role: AdminRole): boolean {
  return role === 'dono' || role === 'financeiro';
}

/**
 * Espelha `canReviewDocuments` de `@vuumbora/api-client/admin` (papéis `dono` e `revisor_documentos`; o teste de
 * contrato confere a lista). Quem não está aqui leva `403 forbidden` em TODA rota de documento, antes de qualquer
 * outra checagem — isto só evita mostrar a fila, o CPF e o arquivo a quem o servidor vai recusar.
 */
export function canReviewDocuments(role: AdminRole | null | undefined): boolean {
  return !!role && DOCUMENT_REVIEW_ROLES.includes(role);
}
