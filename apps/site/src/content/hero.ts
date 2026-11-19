/**
 * Virada para página única de pré-lançamento (`docs/decisoes-do-dono.md` →
 * "Virada do site: página de pré-lançamento", 19/11/2026). Região (Natal e
 * Grande Natal, RN) é argumento central, não rodapé — revoga a decisão
 * anterior de não publicar cidade. Motorista é o público principal; a ação
 * é a candidatura (`DriverApplicationForm`), não um link de âncora.
 */
export const HERO_CONTENT = {
  eyebrow: 'VuumBora em construção · Natal e Grande Natal, RN',
  title: 'Natal vai ter o VuumBora. Candidate-se para dirigir desde o começo.',
  subtitle:
    'Estamos construindo um novo app de corrida, começando por Natal e pela região metropolitana. Quem se candidatar agora é avaliado para fazer parte desde o início.',
  honesty:
    'Ainda não estamos nas lojas. O cadastro de motoristas não abre para todo mundo de uma vez: cada candidatura é avaliada antes de confirmar a vaga.',
} as const;

/** Nota secundária para quem só vai pedir corridas — o passageiro aparece
 * em segundo plano nesta página, propositalmente. */
export const PASSENGER_NOTE = {
  eyebrow: 'Para quem vai pedir corrida',
  title: 'Também vai se deslocar pelo VuumBora?',
  description: 'Avisamos quando o app chegar para passageiros em Natal e na Grande Natal. Nada além disso.',
} as const;
