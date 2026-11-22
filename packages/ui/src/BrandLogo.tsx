/// <reference path="./assets.d.ts" />
import { memo } from 'react';
import { Image, StyleSheet, View, type ImageStyle } from 'react-native';
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

function dimensionsOf(variant: Exclude<BrandLogoVariant, 'lockup'>, size: BrandLogoSize): ImageStyle {
  const height = variant === 'horizontal' ? HORIZONTAL_HEIGHT[size] : SELO_HEIGHT[size];
  return { width: Math.round(height * ASPECT[variant]), height };
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
  if (variant === 'lockup') {
    // §9/auditoria: a largura nominal (160/240/320) não cabia num container mais estreito
    // (`lg`=320 não cabe nos 280 úteis de uma tela de 320pt, `boas-vindas.tsx:48`), então o
    // lockup encolhe junto do container (`width:'100%'` + `maxWidth`).
    // A proporção mora numa CAIXA (View) e não no Image: no react-native-web o Image sem
    // `height` explícito assume a altura nativa do PNG (183) e ignora o `aspectRatio`
    // (regressão medida pela Íris no portão da onda 0: 160x183 em vez de 160x122, CTA do login
    // fora da tela em 320x568). A View recebe `aspect-ratio` de verdade e o Image só a preenche.
    return (
      <View style={[styles.lockupBox, { maxWidth: LOCKUP_WIDTH[size], aspectRatio: ASPECT.lockup }]}>
        <Image
          source={SOURCE.lockup}
          style={[styles.image, styles.fill]}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="VuumBora"
          testID={testID}
        />
      </View>
    );
  }
  return (
    <Image
      source={SOURCE[variant]}
      style={[styles.image, dimensionsOf(variant, size)]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="VuumBora"
      testID={testID}
    />
  );
});

const styles = StyleSheet.create({
  image: { backgroundColor: 'transparent' },
  lockupBox: { width: '100%' },
  fill: { width: '100%', height: '100%' },
});
