/**
 * `docs/conteudo-site.md` §7 — "versão B" entrou em 19/11/2026: o backend da
 * lista de espera existe, então o formulário (`WaitlistForm`) é o CTA
 * principal da faixa; os dois links de navegação (`primaryCta`/
 * `secondaryCta`) continuam abaixo dele, para quem preferir só navegar.
 */
export const FINAL_BANNER_CONTENT = {
  title: 'Estamos construindo o VuumBora à vista.',
  description:
    'Volte aqui de vez em quando. Cada coisa que sair de "em definição" para "pronto" aparece nesta página primeiro.',
  primaryCta: { label: 'Sou passageiro', href: '#passageiro' },
  secondaryCta: { label: 'Quero dirigir', href: '#motorista' },
};
