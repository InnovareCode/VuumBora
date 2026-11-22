# @vuumbora/ui

Componentes React Native **transversais** aos dois apps (lista em `src/index.ts`).

- Estilo só a partir de `theme` de `@vuumbora/tokens` — nenhum HEX ou número mágico de layout.
- Componentes exclusivos de um perfil ficam no app desse perfil, não aqui.
- Contrato mínimo: props tipadas, loading/disabled/error, acessibilidade, teste de interação.
- `react`/`react-native` são peer dependencies (uma única cópia, a dos apps).

Estado: scaffold, sem componentes ainda.

## `src/device/` — camada do APARELHO (não é visual)

Compartilhada pelos dois apps (A3 e B-6 do plano de execução). Exportada pelo `index.ts`: `createDeviceSessionStorage`
e `VerifiedTextView`. Todo o resto é lógica PURA, provada por `npm test --workspace @vuumbora/ui` (`node --import tsx`):

- `sessionVault.ts` / `nativeSessionStorage.ts` — cofre da sessão sobre `expo-secure-store`, com a limpeza da primeira
  execução depois de instalar (o Keychain do iOS sobrevive à desinstalação). O módulo nativo só é importado em
  `deviceSessionStorage.native.ts`; o web usa `deviceSessionStorage.ts` (só memória: nunca `localStorage`).
- `verifiedText.ts` / `useVerifiedText.ts` / `verifyFailureCopy.ts` — baixar um texto e exibi-lo só se o SHA-256 dos bytes
  bater com o publicado pela API (B-6).
- `sessionKeys.ts` repete as chaves do `storageKeys` do api-client; `test/sessionKeys.test.ts` reprova se divergirem.
