import { UserCheck } from 'lucide-react';
import type { NavGroup, NavItem } from './types';
import { flattenNav, matchNavItem } from './types';

/**
 * Mapa de navegação do painel administrativo.
 *
 * Fica em módulo próprio (sem componente) porque é consumido em três lugares
 * — sidebar, gaveta mobile e paleta de comandos (Ctrl+K) — e ter uma única
 * fonte evita o clássico "adicionei a rota e esqueci do menu". Só existe uma
 * área hoje; ao entrar a próxima (ex. documentos, financeiro), ela entra
 * aqui como um novo grupo ou item, não como uma nova casca.
 */

/** Chaves de contador de pendência que a sidebar pode exibir ao lado do item. */
export type AdminBadgeKey = 'pendingDriverApplications';

export const ADMIN_NAV: readonly NavGroup[] = [
  {
    title: 'Motoristas',
    items: [
      {
        label: 'Pré-cadastro',
        href: '/driver-applications',
        icon: UserCheck,
        hint: 'Avaliar candidaturas de motorista recebidas pelo site',
        badge: 'pendingDriverApplications',
        // Espelha `requireDriverApplicationAccess` em
        // apps/api/src/routes/admin-driver-application-route.ts — os dois
        // papéis andam juntos. Se a regra da rota mudar na API, mude aqui
        // também, senão o menu passa a mentir sobre quem pode abrir isto
        // (o backend ainda protege com 403; isto é só o menu não mentir).
        roles: ['dono', 'operacao'],
      },
    ],
  },
];

/** Lista achatada — conveniente para busca e para casar a rota atual. */
export const ADMIN_NAV_ITEMS: readonly NavItem[] = flattenNav(ADMIN_NAV);

/** Item cuja rota casa com o pathname atual (o mais específico vence). */
export function matchAdminNavItem(pathname: string): NavItem | undefined {
  return matchNavItem(ADMIN_NAV, pathname);
}
