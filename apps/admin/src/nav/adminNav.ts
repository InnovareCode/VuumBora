import { FileCheck2, Mail, ShieldCheck, UserCheck, Users } from 'lucide-react';
import type { AdminRole } from '../api/types';
import { DOCUMENT_REVIEW_ROLES } from '../api/documentReviewTypes';
import type { NavGroup, NavItem } from './types';
import { filterNavForRole, flattenNav, matchNavItem } from './types';

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
      {
        label: 'Documentos',
        href: '/document-reviews',
        icon: FileCheck2,
        hint: 'Fila de documentos do motorista: conferir, aprovar ou recusar',
        // `DOCUMENT_REVIEW_ROLES` (dono e revisor de documentos), espelho de `@vuumbora/api-client/admin`. O
        // servidor devolve 403 em toda rota de documento para os outros papéis; isto é só o menu não mentir.
        // O detalhe do motorista mora DENTRO deste prefixo (`/document-reviews/drivers/:id`) de propósito: a
        // tela de acesso negado do `AppShell` casa por prefixo e cobre as duas rotas.
        roles: DOCUMENT_REVIEW_ROLES,
      },
    ],
  },
  {
    title: 'Configurações',
    items: [
      {
        label: 'Usuários',
        href: '/users',
        icon: Users,
        hint: 'Contas do painel administrativo e os papéis de cada uma',
        // Espelha `requireAdminRole('dono')` em apps/api/src/routes/admin-user-route.ts (ver também
        // `lib/permissions.ts` → `canManageAdminUsers`). O backend devolve 403 para os demais.
        roles: ['dono'],
      },
      {
        label: 'E-mail',
        href: '/email',
        icon: Mail,
        hint: 'Servidor SMTP que envia os e-mails do VuumBora',
        // Espelha `requireAdminRole('dono')` em apps/api/src/routes/admin-email-settings-route.ts. O backend
        // devolve 403 para os demais; isto só evita oferecer uma porta que o papel não abre.
        roles: ['dono'],
      },
    ],
  },
  {
    title: 'Minha conta',
    items: [
      {
        label: 'Segurança',
        href: '/security',
        icon: ShieldCheck,
        hint: 'Verificação em duas etapas e códigos de recuperação',
        // Sem `roles`: todo papel autenticado tem conta e pode (ou precisa) usar 2FA.
      },
    ],
  },
];

/** Lista achatada — conveniente para busca e para casar a rota atual. */
export const ADMIN_NAV_ITEMS: readonly NavItem[] = flattenNav(ADMIN_NAV);

/**
 * Primeira área que o papel ENXERGA no menu — destino de `/` e do pós-login. Antes era sempre
 * `/driver-applications`, e quem não abre o pré-cadastro (revisor de documentos, suporte, financeiro)
 * entrava direto na tela de "acesso restrito". Para `dono` e `operacao` continua o pré-cadastro (primeiro
 * item do mapa). Sem papel (deslogado/checando) cai no primeiro item sem restrição.
 */
export function homePathForRole(role: AdminRole | null | undefined): string {
  return filterNavForRole(ADMIN_NAV, role)[0]?.items[0]?.href ?? '/security';
}

/** Item cuja rota casa com o pathname atual (o mais específico vence). */
export function matchAdminNavItem(pathname: string): NavItem | undefined {
  return matchNavItem(ADMIN_NAV, pathname);
}
