import type { ExpoConfig } from 'expo/config';
// Cores lidas da fonte única de tokens — nenhum HEX escrito aqui (docs/decisions.md, D-05).
import tokens from '../../VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json';

const config: ExpoConfig = {
  name: 'VuumBora',
  slug: 'vuumbora-passenger',
  scheme: 'vuumbora-passageiro',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  backgroundColor: tokens.color.background.base.$value,
  // Ícone e splash recortados da logomarca aprovada (Imagens/LogoMarca.png) pelo Apolo.
  // iOS: 1024×1024 opaco, sem cantos arredondados (a Apple aplica a máscara).
  icon: './assets/icon.png',
  ios: {
    // Confirmado pelo dono em 22/11/2026 (DN-07, docs/decisoes-do-dono.md): mudar depois exige app novo na loja.
    bundleIdentifier: 'com.vuumbora.passenger',
    supportsTablet: false,
  },
  android: {
    // Confirmado pelo dono em 22/11/2026 (DN-07).
    package: 'com.vuumbora.passenger',
    // Camada de frente 1024×1024 com o conteúdo dentro do círculo seguro de 66dp (de 108dp).
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: tokens.color.brand.navy.$value,
    },
    // Localização só durante o uso: remove do manifesto final as permissões de segundo plano mesmo que alguma
    // biblioteca (Mapbox, expo-location) as declare. Liberar segundo plano é decisão de produto e exige o formulário
    // de localização em segundo plano no Play Console; quando vier, tirar daqui e ligar no plugin expo-location.
    blockedPermissions: [
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
    ],
  },
  plugins: [
    // `sitemap: false`: sem a rota `/_sitemap` (lista TODAS as rotas do app, versão do SDK e origem, e estava aberta no
    // export de produção). O app não tem uso para ela; a tela de rota inexistente é a nossa, `app/+not-found.tsx`.
    ['expo-router', { sitemap: false }],
    'expo-status-bar',
    'expo-font',
    'expo-image',
    // Cofre da sessão (A3). O plugin exclui o arquivo do SecureStore do backup automático do Android (sem isso o
    // backup restauraria dados cifrados sem a chave do Keystore). `faceIDPermission: false`: o app não usa
    // autenticação biométrica, então o plugin não deve declarar o `NSFaceIDUsageDescription` (texto em inglês).
    ['expo-secure-store', { faceIDPermission: false }],
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
    // Mapbox (docs/decisoes-do-dono.md, item 1). Token público lido em runtime via
    // process.env.EXPO_PUBLIC_MAPBOX_TOKEN — nenhum token escrito aqui. O plugin só
    // configura o build nativo (baixa o SDK do Mapbox); desde que a Mapbox removeu a
    // exigência de auth no download, não precisa de token secreto para funcionar.
    // Detalhes: docs/mapbox.md.
    '@rnmapbox/maps',
    // Localização só DURANTE O USO, sem segundo plano por enquanto (porta nativa: src/location/locationPort.ts).
    // A configuração precisa estar aqui: sem ela, o prebuild aplica o plugin sozinho (está na lista de plugins
    // automáticos do Expo) com textos em inglês e declara no iOS os textos de "sempre" e de movimento, que a Apple
    // questiona na revisão quando o app não usa.
    // `false` remove o texto do Info.plist; `motionUsagePermission: false` também tira o código de movimento do pod.
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'O VuumBora usa sua localização enquanto o app está aberto para marcar o ponto de embarque e calcular a sua corrida.',
        locationFullAccuracyPermission:
          'O VuumBora precisa da sua localização exata para o motorista encontrar você no ponto de embarque certo.',
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        motionUsagePermission: false,
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      },
    ],
  ],
  experiments: { typedRoutes: true },
  // Alvo web habilitado só para preview/screenshot em desenvolvimento (pedido do dono) — entrega continua Android/iOS.
  web: {
    bundler: 'metro',
  },
  extra: {
    profile: 'passenger',
  },
};

export default config;
