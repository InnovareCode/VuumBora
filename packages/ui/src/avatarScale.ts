/**
 * Escala do `Avatar` (diâmetro em pt), tirada das fichas de tela do padrão premium (`docs/fichas-de-tela/`), na grade de
 * 4 pt do §3 de `docs/padrao-premium-telas.md`:
 *  - 32: linha compacta (cartão do motorista em tela curta);
 *  - 40: painel da corrida — P09 ("Avatar 40, nome + veículo numa linha") e M07;
 *  - 48: M09 (corrida em andamento, motorista);
 *  - 56: P08 (motorista atribuído) e M08 (embarque);
 *  - 64: perfil a 320 de largura (P13, M13);
 *  - 88: perfil (P13, M13).
 *
 * Sem React aqui, para a regra ser testável no `node --test`.
 */
export const AVATAR_DIAMETERS = [32, 40, 48, 56, 64, 88] as const;

export type AvatarDiameter = (typeof AVATAR_DIAMETERS)[number];

/**
 * Nomes antigos, de antes da escala das fichas. Continuam valendo com o MESMO tamanho de antes para nenhuma tela mudar
 * sozinha — mas `md` (44) está fora da escala: quem o usa deve trocar pelo diâmetro que a própria ficha pede.
 * @deprecated use um `AvatarDiameter` (ex.: `size={40}`).
 */
export type AvatarSizeName = 'sm' | 'md' | 'lg';

export type AvatarSize = AvatarDiameter | AvatarSizeName;

const LEGACY: Record<AvatarSizeName, number> = { sm: 32, md: 44, lg: 64 };

/** Diâmetro em pt de um `AvatarSize`. */
export function avatarDiameter(size: AvatarSize): number {
  return typeof size === 'number' ? size : LEGACY[size];
}

/** Corpo das iniciais: 38% do diâmetro (proporção que já valia nos tamanhos antigos). */
export function avatarInitialsFontSize(diameter: number): number {
  return Math.round(diameter * 0.38);
}
