# @vuumbora/ui

Componentes React Native **transversais** aos dois apps (lista em `src/index.ts`).

- Estilo só a partir de `theme` de `@vuumbora/tokens` — nenhum HEX ou número mágico de layout.
- Componentes exclusivos de um perfil ficam no app desse perfil, não aqui.
- Contrato mínimo: props tipadas, loading/disabled/error, acessibilidade, teste de interação.
- `react`/`react-native` são peer dependencies (uma única cópia, a dos apps).

Estado: scaffold, sem componentes ainda.
