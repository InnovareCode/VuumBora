/// <reference path="./assets.d.ts" />
import { memo } from 'react';
import { Image, StyleSheet, type ImageStyle } from 'react-native';
import horizontalSource from '../assets/brand/vuumbora-horizontal.png';
import lockupSource from '../assets/brand/vuumbora-lockup.png';
import seloSource from '../assets/brand/vuumbora-selo.png';

export type BrandLogoVariant = 'horizontal' | 'lockup' | 'selo';
export type BrandLogoSize = 'sm' | 'md' | 'lg';

export interface BrandLogoProps {
  /** `horizontal` = ícone + nome (cabeçalho). `lockup` = ícone + nome + tagline (login/splash). `selo` = só o ícone. */
  readonly variant?: BrandLogoVariant;
  readonly size?: BrandLogoSize;
  readonly testID?: string;
}

/** Proporção largura/altura nativa de cada recorte (`packages/ui/assets/brand`). */
const ASPECT: Record<BrandLogoVariant, number> = {
  horizontal: 154 / 40,
  lockup: 240 / 183,
  selo: 74 / 64,
};

const SOURCE: Record<BrandLogoVariant, number> = {
  horizontal: horizontalSource,
  lockup: lockupSource,
  selo: seloSource,
};

// `horizontal`/`selo` escalam pela ALTURA (uso típico: cabeçalho, ícone/badge).
// `lockup` escala pela LARGURA (uso típico: tela de login, centralizado). `md` reproduz
// o tamanho nativo pedido pelo Apolo (horizontal: altura 40; lockup: largura 240).
const HORIZONTAL_HEIGHT: Record<BrandLogoSize, number> = { sm: 28, md: 40, lg: 56 };
const SELO_HEIGHT: Record<BrandLogoSize, number> = { sm: 32, md: 44, lg: 64 };
const LOCKUP_WIDTH: Record<BrandLogoSize, number> = { sm: 160, md: 240, lg: 320 };

function dimensionsOf(variant: BrandLogoVariant, size: BrandLogoSize): ImageStyle {
  const aspect = ASPECT[variant];
  if (variant === 'lockup') {
    // §9/auditoria: a largura nominal (160/240/320) não cabia num container mais estreito
    // (`lg`=320 não cabe nos 280 úteis de uma tela de 320pt, `boas-vindas.tsx:48`).
    // `width:'100%'` + `maxWidth` deixa a imagem encolher junto do container em vez de
    // vazar; `aspectRatio` mantém a proporção calculando a altura sozinho.
    return { width: '100%', maxWidth: LOCKUP_WIDTH[size], aspectRatio: aspect };
  }
  const height = variant === 'horizontal' ? HORIZONTAL_HEIGHT[size] : SELO_HEIGHT[size];
  return { width: Math.round(height * aspect), height };
}

/**
 * Logomarca real da VuumBora (recortes do Apolo em `packages/ui/assets/brand`,
 * substituindo o "V" provisório). Os PNGs têm partes vazadas (recorte do carro e do
 * pino) — só compõem corretamente sobre fundo ESCURO. Os três fundos do tema
 * (`theme.role.screen`/`surface`/`surfaceElevated`) são escuros, então isso é seguro em
 * qualquer tela do app — mas NUNCA usar `BrandLogo` sobre `theme.role.ctaBackground`
 * (amarelo) ou outra superfície clara: as partes vazadas ficariam "furadas".
 */
export const BrandLogo = memo(function BrandLogo({ variant = 'horizontal', size = 'md', testID }: BrandLogoProps) {
  const dims = dimensionsOf(variant, size);
  return (
    <Image
      source={SOURCE[variant]}
      style={[styles.image, dims]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="VuumBora"
      testID={testID}
    />
  );
});

const styles = StyleSheet.create({
  image: { backgroundColor: 'transparent' },
});
