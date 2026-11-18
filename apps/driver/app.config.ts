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
  // PENDENTE (Apolo): icon, splash e adaptiveIcon a partir da logomarca aprovada.
  ios: {
    // PENDENTE: identificador definitivo depende do domínio/conta Apple da empresa.
    bundleIdentifier: 'com.vuumbora.driver',
    supportsTablet: false,
  },
  android: {
    // PENDENTE: idem, conta Google Play.
    package: 'com.vuumbora.driver',
  },
  plugins: ['expo-router', 'expo-status-bar', 'expo-font', 'expo-splash-screen'],
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
