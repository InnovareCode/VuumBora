import type { LucideIcon } from 'lucide-react';

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
