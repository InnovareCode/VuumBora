// ⚠️ LEGADO — NÃO USAR. Mantido apenas como registro do kit original.
//
// Este arquivo tem HEX desatualizados (paleta anterior à medição de 18/11/2026)
// e nomes de token que divergem do JSON. O app NÃO o importa: a fonte única é
// ../tokens/vuumbora.tokens.json, derivada em packages/tokens (@vuumbora/tokens).
// Para consumir o tema no código: import { theme } from "@vuumbora/tokens".

// VuumBora — tokens TypeScript para React Native (proposta)
export const VuumBoraTheme = {
  colors: {
    background: '#070D18',
    surface: '#111B2A',
    elevated: '#192536',
    primary: '#FFCC00',
    primaryPressed: '#E6B800',
    orange: '#F5A400',
    text: '#FFFFFF',
    textSecondary: '#B9C4D2',
    onPrimary: '#0B1220',
    border: '#2D3A4C',
    success: '#22C55E',
    danger: '#F04452',
  },
  spacing: { xs: 4, sm: 8, md: 12, base: 16, lg: 20, xl: 24, xxl: 32 },
  radius: { sm: 8, md: 12, card: 16, large: 20, pill: 999 },
  typography: { caption: 12, small: 14, body: 16, subtitle: 18, title: 22, heading: 28 },
  touchTargetMin: 44,
  buttonHeight: 52,
} as const;
