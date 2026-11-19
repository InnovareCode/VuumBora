/** Rodapé da página única de pré-lançamento — sem coluna de navegação
 * (não há mais seções internas para listar).
 *
 * `legalEntity` chegou aqui em 19/11/2026 quando "Quem está por trás"
 * (`AboutBlock`) saiu da página e virou `AppDownloadBlock` — o CNPJ e a
 * razão social continuam publicados, só mudaram de lugar. */
export const FOOTER_CONTENT = {
  tagline: 'App de mobilidade urbana em construção, chegando a Natal e à Grande Natal.',
  legalEntity: {
    company: 'Innovare Code',
    cnpj: '09.813.446/0001-00',
  },
  socialColumnTitle: 'Redes',
  legalColumnTitle: 'Legal',
  legal: [
    { name: 'Termos de Uso', note: 'Em elaboração — ainda não publicados.' },
    { name: 'Política de Privacidade', note: 'Em elaboração — ainda não publicada.' },
  ],
  contactColumnTitle: 'Contato',
  contactNote: 'Para dúvidas sobre seus dados ou pedido de exclusão da candidatura/lista de espera:',
  contactEmail: 'contato@vuumbora.com.br',
  bottomLeft: 'Projeto em construção.',
  backToTop: { label: 'Voltar ao topo', href: '#topo' },
};
