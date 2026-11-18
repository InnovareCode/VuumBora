---
name: feedback-provar-sem-install
description: Como provar scaffold TS sem rodar npm install no VuumBora — usar o tsc de outro projeto local e scripts só-Node
metadata:
  type: feedback
---
Quando a missão proíbe `npm install`, ainda dá para provar parte do scaffold: o TypeScript 5.9 em
C:/Projetos/App/innovarecode-missoes/node_modules/typescript serve para `tsc --noEmit -p <pacote>` nos pacotes puros
(com tsconfig temporário de `paths` para resolver `@vuumbora/*`), e guardas de arquitetura escritas só em Node rodam direto.

**Why:** a regra da squad pede declarar o que foi provado vs. não provado; sem isso o handoff vira suposição.
**How to apply:** em scaffolds sem install, provar o que for possível assim e listar explicitamente o que só o install/emulador provará (apps, Metro, app.config).
