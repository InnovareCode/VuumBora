import type { AdminRole } from '../api/types';

/** Rótulo em português de cada papel — só para texto de tela, não é lógica de negócio. Fonte única (antes
 * duplicado em `NoAccessPage`); qualquer tela que precise nomear um papel usa este mapa. */
export const ROLE_LABEL: Record<AdminRole, string> = {
  dono: 'Dono',
  operacao: 'Operação',
  revisor_documentos: 'Revisor de documentos',
  financeiro: 'Financeiro',
  suporte: 'Suporte',
};
