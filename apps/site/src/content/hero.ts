/**
 * Texto final de `docs/conteudo-site.md` §1. O dono confirmou em 18/11/2026
 * que o motorista vê o destino antes de aceitar a corrida (é o que o app já
 * implementa, não promessa) — o subtítulo usa a versão principal, com
 * "o destino" (`docs/decisoes-do-dono.md`).
 */
export const HERO_CONTENT = {
  eyebrow: 'App de mobilidade urbana · em construção',
  title: 'Antes de confirmar, você já sabe. Antes de aceitar, também.',
  subtitle:
    'O VuumBora é um novo app de corrida para quem pede e para quem dirige. Quem pede vê o preço estimado e o tempo de espera antes de confirmar, e o nome do motorista, o carro e a placa antes de embarcar. Quem dirige vê o destino, a distância e o valor estimado antes de aceitar.',
  honesty:
    'Ainda não estamos nas lojas. Este site mostra o que já está pronto, o que estamos construindo e o que ainda vamos decidir.',
  primaryCta: { label: 'Sou passageiro', href: '#passageiro' },
  secondaryCta: { label: 'Quero dirigir', href: '#motorista' },
};

export const STORE_BADGES_CONTENT = {
  groupLabel: 'Disponibilidade nas lojas de aplicativo',
  caption: 'Em breve na',
  stores: ['Google Play', 'App Store'] as const,
};
