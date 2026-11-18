---
name: medicao-visual-expo-web
description: Armadilhas ao auditar/medir telas do VuumBora no Expo Web com Playwright (fluxo de corrida, ScrollView, Metro em CI, telas ocultas)
metadata:
  type: project
---

Auditoria premium de 18/11/2026 (docs/auditoria-premium.md) custou retrabalho nestes pontos:

- `/buscando`, `/a-caminho`, `/em-andamento`, `/concluida` redirecionam para `/` sem estado. É preciso percorrer o fluxo: início → "Para onde vamos?" → "Casa" → Confirmar → "Solicitar corrida" → "Pix" → "Solicitar". O simulador avança sozinho (cerca de 2,5 s por fase).
- O expo-router mantém as telas anteriores no DOM, ocultas. `getByText` acha a oculta e trava. Use `locator('text="X" >> visible=true')`.
- `fullPage` não pega o `ScrollView` do RN Web. Use uma viewport alta (1500) para ver a tela inteira.
- `CI=1 npx expo start` desliga o watch do Metro e serve um bundle congelado. Para medir código que outra frente está mudando, suba sem `CI`.
- Não há playwright no repositório. Use o `playwright-core` de `C:/Projetos/Web/InnoChat/node_modules`.
- O Git Bash converte `/rota` em caminho do Windows nos argumentos. Rode com `MSYS_NO_PATHCONV=1`.

**Why:** em auditoria com frentes paralelas mexendo em `packages/ui`, um retrato velho vira achado falso.
**How to apply:** anote o horário de cada medição. Antes de delegar uma correção, confira o mtime dos arquivos citados. Ver [[paleta-vuumbora]].
