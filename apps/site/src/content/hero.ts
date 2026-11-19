/**
 * Reconstrução sobre as artes do dono (`src/content/artes.ts`, 19/11/2026):
 * o olho/título/apoio de abertura do Hero agora vêm de `ARTE_HERO` — não são
 * reescritos aqui, para o site nunca dizer uma coisa e a arte dizer outra.
 * Sobra só o aviso de transparência, que não é texto de nenhuma arte.
 */
export const HERO_HONESTY =
  'Ainda não estamos nas lojas. O cadastro de motoristas não abre para todo mundo de uma vez: cada candidatura é avaliada antes de confirmar a vaga.';

/** Nota secundária para quem só vai pedir corridas — o passageiro aparece
 * em segundo plano nesta página, propositalmente. */
export const PASSENGER_NOTE = {
  eyebrow: 'Para quem vai pedir corrida',
  title: 'Também vai se deslocar pelo VuumBora?',
  description: 'Avisamos quando o app chegar para passageiros em Natal e na Grande Natal. Nada além disso.',
} as const;
