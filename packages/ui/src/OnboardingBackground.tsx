/// <reference path="./assets.d.ts" />
import { memo } from 'react';
import { Image, type ImageContentPosition, type ImageStyle } from 'expo-image';
import backgroundSource from '../assets/backgrounds/onboarding-noturno.jpg';

export interface OnboardingBackgroundProps {
  readonly testID?: string;
}

// `StyleSheet.absoluteFill` é tipado como `ViewStyle` (`overflow` aceita "scroll"), que
// o `ImageStyle` do expo-image não aceita — por isso os 4 lados ficam explícitos aqui
// em vez de reusar o helper do RN core. Sem prop `style`: este componente só cobre o
// contêiner do chamador por completo, de propósito (fundo de tela inteira).
const ABSOLUTE_FILL: ImageStyle = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };

// `center 30%` da maquete (tools/art-assets/onboarding-premium.html) — horizonte da cena
// medido a 45% da altura do asset (docs/direcao-de-arte.md §7.1); `expo-image` é quem dá
// controle de posição fina (RN core `Image` só centraliza o recorte).
const CONTENT_POSITION: ImageContentPosition = { top: '30%', left: 'center' };

/**
 * Fundo fotográfico das boas-vindas (direção de arte §7.1/§9 item 9, asset
 * `onboarding-noturno.jpg`) — ilustração procedural, não foto de terceiro. Preenche o
 * contêiner do chamador; usar SEMPRE com `theme.gradient.photoScrim` atrás do bloco de
 * texto (contraste medido: 1,49:1 sem scrim, 16,8:1 com).
 */
export const OnboardingBackground = memo(function OnboardingBackground({ testID }: OnboardingBackgroundProps) {
  return (
    <Image
      source={backgroundSource}
      style={ABSOLUTE_FILL}
      contentFit="cover"
      contentPosition={CONTENT_POSITION}
      testID={testID}
    />
  );
});
