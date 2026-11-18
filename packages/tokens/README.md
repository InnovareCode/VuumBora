# @vuumbora/tokens

Converte `VuumBora_Claude_Design_System/tokens/vuumbora.tokens.json` (fonte única, formato DTCG)
em objetos TypeScript prontos para React Native (`"16px"` vira `16`).

- `tokens`: primitivos, espelho 1:1 do JSON.
- `theme`: `tokens` + `role` (papéis semânticos que os componentes devem consumir).

**Regra:** nenhum HEX ou dimensão escrito à mão aqui ou em qualquer app/pacote.
Para mudar a paleta, edite o JSON. `npm run check:boundaries` (raiz) bloqueia HEX solto.
`codigo/theme.ts` do kit é legado e não é usado (ver `docs/decisions.md`, D-06).
