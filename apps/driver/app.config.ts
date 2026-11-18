import type { ExpoConfig } from 'expo/config';
// Cores lidas da fonte única de tokens — nenhum HEX escrito aqui (docs/decisions.md, D-05).
import tokens from '../../VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json';

const config: ExpoConfig = {
  name: 'VuumBora Motorista',
  slug: 'vuumbora-driver',
  scheme: 'vuumbora-motorista',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: tokens.color.background.base.$value,
  // Ícone e splash recortados da logomarca aprovada (Imagens/LogoMarca.png) pelo Apolo.
  // iOS: 1024×1024 opaco, sem cantos arredondados (a Apple aplica a máscara).
  icon: './assets/icon.png',
  ios: {
    // PENDENTE: identificador definitivo depende do domínio/conta Apple da empresa.
    bundleIdentifier: 'com.vuumbora.driver',
    supportsTablet: false,
  },
  android: {
    // PENDENTE: idem, conta Google Play.
    package: 'com.vuumbora.driver',
    // Camada de frente 1024×1024 com o conteúdo dentro do círculo seguro de 66dp (de 108dp).
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: tokens.color.brand.navy.$value,
    },
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    'expo-font',
    [
      'expo-splash-screen',
      {
        // SDK 58: splash só pelo plugin. Logo centralizada dentro do círculo inscrito do PNG,
        // para não ser cortada pela máscara circular do splash do Android 12+ (192dp visíveis).
        image: './assets/splash-icon.png',
        imageWidth: 192,
        resizeMode: 'contain',
        backgroundColor: tokens.color.brand.navy.$value,
      },
    ],
  ],
  experiments: { typedRoutes: true },
  // Alvo web habilitado só para preview/screenshot em desenvolvimento (pedido do dono) — entrega continua Android/iOS.
  web: {
    bundler: 'metro',
  },
  extra: {
    profile: 'driver',
  },
};

export default config;
