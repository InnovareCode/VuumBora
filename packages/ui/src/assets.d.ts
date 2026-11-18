/**
 * Metro resolve `import x from './foo.png'` para um id numérico de asset (igual a
 * `require('./foo.png')`) — `Image.source` (`ImageSourcePropType`) aceita esse número
 * diretamente. Sem esta declaração, `tsc` não sabe o que um módulo "*.png" exporta.
 *
 * Esta declaração só entra num programa de typecheck (ui, passenger ou driver) porque
 * `BrandLogo.tsx` a referencia via triple-slash (`/// <reference path="./assets.d.ts" />`)
 * — sem isso, o `tsc --noEmit` de cada APP (que só inclui arquivos dentro da própria
 * pasta) nunca enxergaria este `.d.ts`, mesmo importando `BrandLogo` via `@vuumbora/ui`.
 */
declare module '*.png' {
  const value: number;
  export default value;
}

declare module '*.jpg' {
  const value: number;
  export default value;
}
