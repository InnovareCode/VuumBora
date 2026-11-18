/**
 * Fonte única dos links de navegação. Header (desktop + mobile) e Footer
 * leem daqui — antes cada um tinha a própria lista hardcoded e podia
 * divergir. Ordem e âncoras vêm de `docs/conteudo-site.md` §0.
 */
export interface NavLink {
  href: string;
  label: string;
}

export const NAV_LINKS: NavLink[] = [
  { href: '#passageiro', label: 'Para passageiros' },
  { href: '#motorista', label: 'Para motoristas' },
  { href: '#servicos', label: 'O que vamos oferecer' },
  { href: '#transparencia', label: 'Onde estamos' },
  { href: '#perguntas', label: 'Perguntas' },
];
