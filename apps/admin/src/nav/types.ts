import type { LucideIcon } from 'lucide-react';
import type { AdminRole } from '../api/types';

/**
 * Vocabulário de navegação da casca do admin (sidebar, gaveta mobile e
 * paleta de comandos). Hoje só existe uma área (`adminNav.ts` tem um único
 * grupo com um único item) — o tipo já é o de um painel com várias, porque
 * a próxima tela só precisa entrar no mapa, não reescrever a casca.
 */
export interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  /** Casa a rota por igualdade (e não por prefixo) — usado em telas-índice. */
  readonly exact?: boolean;
  /** Texto curto de apoio, exibido na paleta de comandos. */
  readonly hint: string;
  /** Chave do contador de pendência exibido ao lado do item, quando houver. */
  readonly badge?: string;
  /**
   * Papéis que enxergam este item no menu. Ausente = todos os papéis
   * autenticados veem. ATENÇÃO: isto NÃO é segurança — é só não mostrar ao
   * admin uma porta que o próprio papel não abre. Quem protege de verdade é
   * o backend (`requireAdminRole` em `apps/api/src/hooks/require-admin.ts`),
   * que já devolve 403. Ver `isItemVisibleForRole`/`filterNavForRole` abaixo
   * e a tela de acesso negado em `src/pages/NoAccessPage.tsx`, para quem
   * digitar a rota direto na barra.
   */
  readonly roles?: readonly AdminRole[];
}

export interface NavGroup {
  readonly title: string;
  readonly items: readonly NavItem[];
}

/** Achata os grupos — conveniente para busca e para casar a rota atual. */
export function flattenNav(groups: readonly NavGroup[]): NavItem[] {
  return groups.flatMap((g) => [...g.items]);
}

/**
 * Item cuja rota casa com o pathname atual.
 *
 * O mais específico vence: sem ordenar por tamanho do `href`, uma rota curta
 * (ex. "/admin") casaria como prefixo de todas as subrotas e o menu marcaria
 * o item errado como ativo em qualquer tela mais profunda.
 */
export function matchNavItem(groups: readonly NavGroup[], pathname: string): NavItem | undefined {
  return [...flattenNav(groups)]
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) =>
      item.exact ? pathname === item.href || pathname === `${item.href}/` : pathname.startsWith(item.href),
    );
}

/** `item.roles` ausente = todo papel autenticado vê. Sem `role` (ainda checando/deslogado) não vê nada com restrição. */
export function isItemVisibleForRole(item: NavItem, role: AdminRole | null | undefined): boolean {
  return !item.roles || (role != null && item.roles.includes(role));
}

/**
 * Filtra os grupos pelo papel e descarta grupo que ficou sem item nenhum —
 * senão a sidebar mostra um título de grupo vazio, pior do que não mostrar o
 * grupo. Consumida pelos três lugares que leem o mapa de navegação: sidebar,
 * gaveta mobile e paleta de comandos.
 */
export function filterNavForRole(groups: readonly NavGroup[], role: AdminRole | null | undefined): NavGroup[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => isItemVisibleForRole(item, role)) }))
    .filter((group) => group.items.length > 0);
}
